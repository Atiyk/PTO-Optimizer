import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '@/db/client';
import { locations } from '@/db/schema';
import { CHILD_DATA_DENY } from '@/db/childData';
import { CAPABILITIES } from './registry';
import { buildOrg, humanActor, run } from '@/test/fixtures';
import { freshDb } from '@/test/db';

/*
 * Phase 2 coverage capabilities: setup, the engine's gap through getCoverage (with its
 * citation), CSV imports with undo, hourly sick leave from imported hours, RBAC.
 */

let db: Db;
let A: Awaited<ReturnType<typeof buildOrg>>;
let roomId: string;
let otherSiteId: string;

beforeAll(async () => {
  db = await freshDb();
  A = await buildOrg(db, 'Sunbeam');
  const owner = humanActor(A.owner);
  await run(db, owner, 'manageSchedule', { op: 'selectRulePack', locationId: A.location.id, packKey: 'childcare-us-ca', sickPolicy: 'none' });
  roomId = (await run(db, owner, 'manageSchedule', { op: 'upsertRoom', locationId: A.location.id, name: 'Infants', groupKey: 'infant' })).id!;
  // 8 infants Mon 08:00–12:00 → CA 1:4 → 2 staff (22 CCR § 101416.5(b)).
  await run(db, owner, 'manageSchedule', { op: 'setDemand', roomId, rows: [{ weekday: 0, start: '08:00', end: '12:00', group: 'infant', count: 8 }] });
  for (const m of [A.emp, A.emp2]) {
    await run(db, owner, 'manageSchedule', { op: 'setShifts', memberId: m.id, rows: [{ roomId, weekday: 0, start: '08:00', end: '16:00' }] });
  }
  const [loc] = await db.insert(locations).values({ orgId: A.org.id, name: 'Second site', countryCode: 'US', subdivisionCode: 'CA' }).returning();
  otherSiteId = loc!.id;
});

describe('coverage capabilities', () => {
  it('a fully staffed Monday has no gaps', async () => {
    const out = await run(db, humanActor(A.manager), 'getCoverage', { locationId: A.location.id, date: '2026-11-02' });
    expect(out.regulated).toBe(true);
    expect(out.packs.map((p) => p.key)).toEqual(['childcare-us-ca']);
    expect(out.days[0]!.gaps.filter((g) => g.kind === 'ratio')).toEqual([]);
    expect(out.notice).toMatch(/not legal advice/i);
  });

  it('one person on leave opens a cited ratio gap for exactly the demand window', async () => {
    await run(db, humanActor(A.emp), 'submitLeaveRequest', { leaveType: 'vacation', start: '2026-11-09', end: '2026-11-09', idempotencyKey: 'cov-gap-1' });
    const firm = await run(db, humanActor(A.manager), 'getCoverage', { locationId: A.location.id, date: '2026-11-09' });
    expect(firm.days[0]!.gaps.filter((g) => g.kind === 'ratio')).toEqual([]);
    const likely = await run(db, humanActor(A.manager), 'getCoverage', { locationId: A.location.id, date: '2026-11-09', includePending: true, detail: 'blocks' });
    const ratio = likely.days[0]!.gaps.filter((g) => g.kind === 'ratio');
    expect(ratio).toHaveLength(1);
    expect(ratio[0]).toMatchObject({ roomName: 'Infants', start: '08:00', end: '12:00', required: 2, present: 1, short: 1, basis: 'law' });
    expect(ratio[0]!.citation?.section).toContain('101416.5');
    const grid = likely.days[0]!.grid!;
    expect(grid.find((b) => b.block === '08:00')!.rooms[0]).toMatchObject({ children: 8, required: 2, present: 1, gap: 1 });
  });

  it('a leave request at a regulated site shows the block-level gap it opens, with the citation', async () => {
    const emp2 = humanActor(A.emp2);
    // emp's Nov 9 request is still pending, so emp2's request is checked against approved leave only.
    const d = await run(db, emp2, 'draftLeaveRequest', { start: '2026-11-23', end: '2026-11-23' });
    expect(d.blockCoverage).toHaveLength(1);
    expect(d.blockCoverage[0]).toMatchObject({ date: '2026-11-23', start: '08:00', end: '12:00', required: 2, present: 1, short: 1, roomName: 'Infants' });
    expect(d.blockCoverage[0]!.citation?.section).toContain('101416.5');
    expect(d.canSubmit).toBe(true); // a gap warns; it never blocks the employee from asking
    expect(d.warnings.join(' ')).toMatch(/08:00–12:00 in Infants: 1 of 2 required staff/);
    // An afternoon appointment outside the demand window opens no gap; one inside it does.
    const pm = await run(db, emp2, 'draftLeaveRequest', { start: '2026-11-23', end: '2026-11-23', part: 'hours', startTime: '13:00', endTime: '15:00' });
    expect(pm.blockCoverage).toEqual([]);
    const am = await run(db, emp2, 'draftLeaveRequest', { start: '2026-11-23', end: '2026-11-23', part: 'hours', startTime: '10:00', endTime: '11:00' });
    expect(am.blockCoverage.map((g) => [g.start, g.end])).toEqual([['10:00', '11:00']]);
    const bad = await run(db, emp2, 'draftLeaveRequest', { start: '2026-11-23', end: '2026-11-23', part: 'hours', hours: 3, startTime: '10:00', endTime: '11:00' });
    expect(bad.problems.join(' ')).toMatch(/does not match/);
  });

  it('D4: a ratio gap is a hard fail for auto-approval; a manager approving sees the gap', async () => {
    const owner = humanActor(A.owner);
    await run(db, owner, 'manageOrgSetup', { op: 'upsertLeaveType', key: 'vacation', name: 'Vacation', autoApprove: true, maxAutoApproveDays: 2 });
    await run(db, owner, 'manageOrgSetup', { op: 'setAutonomy', capability: 'decideLeaveRequest', actorClass: 'assistant', level: 3, reversibleMinutes: 60 });
    const s = await run(db, humanActor(A.emp2), 'submitLeaveRequest', { start: '2026-11-30', end: '2026-11-30', idempotencyKey: 'cov-d4-1' });
    expect(s.request.status).toBe('pending');
    const p = await run(db, humanActor(A.manager), 'listPendingApprovals', {});
    expect(p.requests.find((r) => r.id === s.request.id)!.autoApproval!.blockers).toContain('Would break a staffing ratio or required-role rule.');
    // A Tuesday has no demand, so it auto-approves.
    const t = await run(db, humanActor(A.emp2), 'submitLeaveRequest', { start: '2026-12-01', end: '2026-12-01', idempotencyKey: 'cov-d4-2' });
    expect(t.request.status).toBe('approved');
    const dec = await run(db, humanActor(A.manager), 'decideLeaveRequest', { requestId: s.request.id, decision: 'approve' });
    expect(dec.blockCoverage?.[0]).toMatchObject({ date: '2026-11-30', short: 1 });
    await run(db, owner, 'manageOrgSetup', { op: 'setAutonomy', capability: 'decideLeaveRequest', actorClass: 'assistant', level: 1, reversibleMinutes: 60 });
  });

  it('staff see their own site only; admins only can change setup', async () => {
    const emp = humanActor(A.emp);
    await expect(run(db, emp, 'getCoverage', { locationId: A.location.id, date: '2026-11-02' })).resolves.toBeTruthy();
    await expect(run(db, emp, 'getCoverage', { locationId: otherSiteId })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(run(db, emp, 'manageSchedule', { op: 'archiveRoom', roomId })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(run(db, humanActor(A.manager), 'manageCredentials', { op: 'define', key: 'cpr', name: 'CPR' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(run(db, emp, 'getCredentials', { memberId: A.emp2.id })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(run(db, emp, 'getSickLeave', { memberId: A.emp2.id })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(run(db, emp, 'importHoursWorked', { stage: 'preview', rows: [] })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('credential CSV: preview, commit, expiry bands, undo', async () => {
    const owner = humanActor(A.owner);
    const csv = `Name,Certification,Expiry date\n${A.emp.name},Pediatric CPR,2026-11-10\n${A.emp2.name},Pediatric CPR,2027-11-10\n`;
    const preview = await run(db, owner, 'importCsv', { stage: 'preview', kind: 'credentials', csv });
    expect(preview.errorCount).toBe(0);
    const bad = await run(db, owner, 'importCsv', { stage: 'commit', kind: 'credentials', csv: `${csv}Nobody,CPR,2027-01-01\n` });
    expect(bad.committed).toBe(0);
    const done = await run(db, owner, 'importCsv', { stage: 'commit', kind: 'credentials', csv });
    expect(done.committed).toBe(2);
    const creds = await run(db, humanActor(A.manager), 'getCredentials', { alertsOnly: true });
    expect(creds.records.map((r) => [r.memberId, r.band])).toEqual([[A.emp.id, '14']]);
    const mine = await run(db, humanActor(A.emp2), 'getCredentials', {});
    expect(mine.records.map((r) => r.memberId)).toEqual([A.emp2.id]);
    const undo = await run(db, owner, 'importCsv', { stage: 'undo', kind: 'credentials', batchId: done.batchId! });
    expect(undo.undone).toBe(2);
    expect((await run(db, owner, 'getCredentials', {})).records).toEqual([]);
  });

  it('shift CSV maps "From/To" to shift times, not leave dates', async () => {
    const owner = humanActor(A.owner);
    const csv = `Employee,Classroom,Day,From,To\n${A.manager.name},Infants,Monday,8am,12:30\n`;
    const r = await run(db, owner, 'importCsv', { stage: 'preview', kind: 'shifts', csv });
    expect(r.errorCount).toBe(0);
  });

  it('hourly sick leave accrues from imported hours, with the law cited', async () => {
    const owner = humanActor(A.owner);
    await run(db, owner, 'manageSchedule', { op: 'selectRulePack', locationId: A.location.id, packKey: 'labor-us-ca', sickPolicy: 'accrue', effectiveFrom: '2026-01-01' });
    // A.emp started 2024, so the 90-day wait is long over. 300 h worked → 10 h at 1 per 30.
    const imp = await run(db, owner, 'importHoursWorked', {
      stage: 'commit',
      rows: [
        { member: A.emp.id, periodStart: '2026-10-01', periodEnd: '2026-10-15', hours: 150 },
        { member: A.emp.id, periodStart: '2026-10-16', periodEnd: '2026-10-31', hours: 150 },
      ],
    });
    expect(imp.committed).toBe(2);
    const s = await run(db, humanActor(A.emp), 'getSickLeave', { asOf: '2026-11-02' });
    expect(s.hasPolicy).toBe(true);
    expect(s.unit).toBe('hours');
    expect(s.balance).toBe(10);
    expect(s.source).toMatch(/246/);
    expect(s.entries.some((e) => /30 hours worked/.test(e.note))).toBe(true);
    const undo = await run(db, owner, 'importHoursWorked', { stage: 'undo', batchId: imp.batchId! });
    expect(undo.undone).toBe(2);
    expect((await run(db, humanActor(A.emp), 'getSickLeave', { asOf: '2026-11-02' })).balance).toBe(0);
  });

  it('no capability input or output schema has a field for child-identifying data', () => {
    const hits: string[] = [];
    let seen = 0;
    const walk = (node: unknown, path: string) => {
      if (!node || typeof node !== 'object') return;
      const props = (node as { properties?: Record<string, unknown> }).properties;
      if (props) for (const [k, v] of Object.entries(props)) {
        seen++;
        if (CHILD_DATA_DENY.test(k)) hits.push(`${path}.${k}`);
        walk(v, `${path}.${k}`);
      }
      for (const v of Object.values(node)) if (v && typeof v === 'object' && v !== props) walk(v, path);
    };
    for (const c of Object.values(CAPABILITIES)) {
      walk(c.input.toJSONSchema?.({ io: 'input', unrepresentable: 'any' }), `${c.name}.input`);
      walk(c.output.toJSONSchema?.({ unrepresentable: 'any' }), `${c.name}.output`);
    }
    expect(seen).toBeGreaterThan(300);
    expect(hits).toEqual([]);
  });
});
