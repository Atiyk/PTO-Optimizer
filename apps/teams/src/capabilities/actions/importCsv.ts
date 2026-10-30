import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { balanceLedger, leaveRequests, leaveTypes, locations, members, teams } from '@/db/schema';
import { balanceView, evaluateRequest, getMember, isoDate } from '@/domain/leave';
import { formatWorkWeek } from '@/domain/workWeek';
import { parseCsv } from '@/lib/csv';
import type { Db } from '@/db/client';
import { CapabilityError } from '../errors';
import { defineCapability } from '../types';
import { COVERAGE_SYNONYMS, COVERAGE_TARGETS, commitCoverageRows, undoCoverageBatch, validateCoverageRows, type CoverageKind } from './coverageCsv';

/*
 * CSV import for switching from Timetastic, Vacation Tracker or a spreadsheet.
 * preview: parse, auto-map columns, validate every row, change nothing.
 * commit: re-validate; any error rejects the whole file; otherwise everything is written in
 * one transaction, so a failure part-way rolls back completely.
 */

const TARGETS = {
  members: ['name', 'email', 'role', 'team', 'location', 'startDate', 'manager', 'workWeek', 'hoursPerDay', 'tags', 'balance'],
  leave: ['member', 'leaveType', 'start', 'end', 'part', 'status'],
  ...COVERAGE_TARGETS,
} as const;

const SYNONYMS: Record<string, string[]> = {
  name: ['name', 'full name', 'employee', 'employee name', 'user', 'person'],
  email: ['email', 'e-mail', 'email address', 'work email'],
  role: ['role', 'permission', 'user type', 'access level'],
  team: ['team', 'department', 'group'],
  location: ['location', 'country', 'office', 'public holidays'],
  startDate: ['start date', 'employment start date', 'joined', 'hire date', 'started'],
  manager: ['manager', 'approver', 'line manager', 'boss'],
  workWeek: ['work week', 'working days', 'workdays'],
  hoursPerDay: ['hours per day', 'daily hours', 'hours/day'],
  tags: ['tags', 'skills', 'job title', 'title'],
  balance: ['balance', 'remaining', 'remaining allowance', 'allowance remaining', 'days remaining', 'available'],
  member: ['name', 'employee', 'email', 'user', 'member'],
  leaveType: ['leave type', 'type', 'absence type', 'leave'],
  start: ['start', 'start date', 'from', 'first day', 'leave start'],
  end: ['end', 'end date', 'to', 'last day', 'leave end'],
  part: ['part', 'duration', 'half day', 'length'],
  status: ['status', 'state'],
};

type Kind = keyof typeof TARGETS;
const isCoverageKind = (k: Kind): k is CoverageKind => k in COVERAGE_TARGETS;

function autoMap(kind: Kind, header: string[]): Record<string, number> {
  const norm = header.map((h) => h.trim().toLowerCase());
  const out: Record<string, number> = {};
  for (const t of TARGETS[kind]) {
    // Coverage kinds use their own synonym list ("start" means a shift time there, a leave date here).
    const syn = (isCoverageKind(kind) ? COVERAGE_SYNONYMS[t] : undefined) ?? SYNONYMS[t]!;
    const idx = norm.findIndex((h) => syn.includes(h));
    if (idx >= 0 && !Object.values(out).includes(idx)) out[t] = idx;
  }
  return out;
}

const DAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
function parseWorkWeekText(s: string): string | null {
  const t = s.trim().toLowerCase();
  if (!t) return '1111100';
  if (/^[01]{7}$/.test(t)) return t;
  const range = /^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\s*[-–]\s*(mon|tue|wed|thu|fri|sat|sun)[a-z]*$/.exec(t);
  if (range) {
    const a = DAY_NAMES.indexOf(range[1]!);
    const b = DAY_NAMES.indexOf(range[2]!);
    if (a <= b) return formatWorkWeek(DAY_NAMES.map((_, i) => i >= a && i <= b) as never);
  }
  const list = t.split(/[\s,/]+/).map((d) => DAY_NAMES.indexOf(d.slice(0, 3)));
  if (list.every((i) => i >= 0)) return formatWorkWeek(DAY_NAMES.map((_, i) => list.includes(i)) as never);
  return null;
}

/** Accepts YYYY-MM-DD, DD/MM/YYYY (or with dots/dashes), and "Jan 5 2026"-style dates. */
function parseDate(s: string, dayFirst: boolean): string | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) {
    const [a, b, y] = [Number(m[1]), Number(m[2]), m[3]];
    const [d, mo] = dayFirst ? [a, b] : [b, a];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const p = Date.parse(`${t} UTC`);
  return Number.isNaN(p) ? null : new Date(p).toISOString().slice(0, 10);
}

const ROLE_MAP: Record<string, 'admin' | 'manager' | 'employee'> = {
  admin: 'admin', administrator: 'admin', owner: 'admin', 'account owner': 'admin',
  manager: 'manager', approver: 'manager', 'line manager': 'manager',
  employee: 'employee', user: 'employee', member: 'employee', staff: 'employee', '': 'employee',
};

interface RowResult {
  line: number;
  values: Record<string, string>;
  errors: string[];
}

async function validate(db: Db, orgId: string, kind: Kind, rows: string[][], mapping: Record<string, number>, dayFirst: boolean, today: string) {
  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const results: RowResult[] = [];
  const locs = await db.select().from(locations).where(eq(locations.orgId, orgId));
  const types = await db.select().from(leaveTypes).where(eq(leaveTypes.orgId, orgId));
  const existing = await db.select().from(members).where(and(eq(members.orgId, orgId), isNull(members.deletedAt)));
  const fileNames = new Set(kind === 'members' ? body.map((r) => (r[mapping.name ?? -1] ?? '').trim().toLowerCase()) : []);
  const findLoc = (v: string) => locs.find((l) => l.name.toLowerCase() === v.toLowerCase() || l.countryCode === v.toUpperCase() || `${l.countryCode}-${l.subdivisionCode}` === v.toUpperCase());

  if (kind === 'members' && mapping.name == null) throw new CapabilityError('invalid_input', 'Map a column to "name" (we could not find one in the header).', { header });
  if (kind === 'leave' && (mapping.member == null || mapping.start == null)) throw new CapabilityError('invalid_input', 'Map columns to "member" and "start".', { header });

  for (const [i, r] of body.entries()) {
    const get = (k: string) => (mapping[k] == null ? '' : (r[mapping[k]!] ?? '').trim());
    const errors: string[] = [];
    const values: Record<string, string> = {};
    if (kind === 'members') {
      values.name = get('name');
      if (!values.name) errors.push('name is empty');
      values.email = get('email');
      if (values.email && !/^[^@\s]+@[^@\s]+$/.test(values.email)) errors.push('email is not valid');
      const role = ROLE_MAP[get('role').toLowerCase()];
      if (!role) errors.push(`role "${get('role')}" is not admin, manager or employee`);
      values.role = role ?? 'employee';
      values.team = get('team');
      values.location = get('location');
      if (values.location && !findLoc(values.location)) errors.push(`location "${values.location}" does not match a location (add it in Setup first)`);
      const sd = get('startDate');
      values.startDate = sd ? (parseDate(sd, dayFirst) ?? '') : '';
      if (sd && !values.startDate) errors.push(`start date "${sd}" is not a date`);
      values.manager = get('manager');
      if (values.manager && !fileNames.has(values.manager.toLowerCase()) && !existing.some((m) => m.name.toLowerCase() === values.manager!.toLowerCase() || m.email?.toLowerCase() === values.manager!.toLowerCase())) {
        errors.push(`manager "${values.manager}" is not in this file or the org`);
      }
      const ww = parseWorkWeekText(get('workWeek'));
      if (!ww) errors.push(`work week "${get('workWeek')}" not understood (try "Mon-Fri" or "1111100")`);
      values.workWeek = ww ?? '1111100';
      const hpd = get('hoursPerDay');
      values.hoursPerDay = hpd || '8';
      if (!(Number(values.hoursPerDay) > 0 && Number(values.hoursPerDay) <= 24)) errors.push(`hours per day "${hpd}" must be between 0 and 24`);
      values.tags = get('tags');
      const bal = get('balance');
      values.balance = bal;
      if (bal && !Number.isFinite(Number(bal))) errors.push(`balance "${bal}" is not a number`);
      if (existing.some((m) => m.name.toLowerCase() === values.name!.toLowerCase())) errors.push('a member with this name already exists');
    } else {
      const who = get('member');
      values.member = who;
      const m = existing.find((x) => x.name.toLowerCase() === who.toLowerCase() || (x.email && x.email.toLowerCase() === who.toLowerCase()));
      if (!m) errors.push(`member "${who}" not found (import members first)`);
      else values.memberId = m.id;
      const lt = get('leaveType').toLowerCase() || 'vacation';
      const type = types.find((t) => t.key === lt || t.name.toLowerCase() === lt) ?? (/(annual|holiday|pto|vacation)/.test(lt) ? types.find((t) => t.key === 'vacation') : /sick/.test(lt) ? types.find((t) => t.key === 'sick') : undefined);
      if (!type) errors.push(`leave type "${lt}" not found`);
      else values.leaveType = type.key;
      values.start = parseDate(get('start'), dayFirst) ?? '';
      if (!values.start) errors.push(`start "${get('start')}" is not a date`);
      values.end = get('end') ? (parseDate(get('end'), dayFirst) ?? '') : values.start;
      if (!values.end) errors.push(`end "${get('end')}" is not a date`);
      if (values.start && values.end && values.end < values.start) errors.push('end is before start');
      const part = get('part').toLowerCase();
      values.part = /am|morning/.test(part) ? 'am' : /pm|afternoon/.test(part) ? 'pm' : /half/.test(part) ? 'am' : 'full';
      const st = get('status').toLowerCase();
      values.status = !st || /approv|accept|booked|taken/.test(st) ? 'approved' : /pend|request|await/.test(st) ? 'pending' : 'skip';
      if (values.status === 'skip') errors.push(`status "${st}" is not approved or pending (declined/cancelled rows are not imported)`);
      if (m && values.start && values.end && values.leaveType && errors.length === 0) {
        const ev = await evaluateRequest(db, orgId, m, { leaveTypeKey: values.leaveType, start: values.start, end: values.end, part: values.part as 'full' }, today);
        // Imported history may be in the past or exceed today's balance; only shape problems block.
        const blocking = ev.cost.problems.concat(ev.problems.filter((p) => p.startsWith('Overlaps')));
        errors.push(...blocking);
        values.deducts = String(ev.cost.amount);
        values.unit = ev.unit;
        values.chargedDates = ev.cost.chargedDates.join(' ');
      }
    }
    results.push({ line: i + 2, values, errors });
  }
  return { header, results };
}

export const importCsv = defineCapability({
  name: 'importCsv',
  description:
    'Admin-only CSV import: members (with optional starting balances), booked leave, staff credentials, weekly ' +
    'schedules or hours worked. stage "preview" parses, maps columns and validates every row without changing ' +
    'anything; stage "commit" writes all rows in one transaction and rejects the whole file if any row has an ' +
    'error. Credentials, schedules and hours commits return a batchId; stage "undo" with that batchId reverses it.',
  input: z.object({
    stage: z.enum(['preview', 'commit', 'undo']),
    kind: z.enum(['members', 'leave', 'credentials', 'shifts', 'hours']),
    csv: z.string().max(1_000_000).default(''),
    batchId: z.uuid().optional().describe('For stage "undo": the batchId a coverage import returned.'),
    mapping: z.record(z.string(), z.number().int().min(0)).optional().describe('target field → column index; auto-detected when omitted'),
    dayFirst: z.boolean().default(true).describe('Interpret 03/04/2026 as 3 April (true) or March 4 (false).'),
    balanceLeaveType: z.string().default('vacation'),
  }),
  output: z.object({
    header: z.array(z.string()),
    mapping: z.record(z.string(), z.number()),
    targets: z.array(z.string()),
    rows: z.array(z.object({ line: z.number(), values: z.record(z.string(), z.string()), errors: z.array(z.string()) })),
    errorCount: z.number(),
    committed: z.number(),
    batchId: z.string().nullable().optional(),
    undone: z.number().optional(),
  }),
  scope: 'admin',
  roles: ['owner', 'admin'],
  effect: 'commit',
  idempotent: false,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  rateLimit: 'write',
  surfaces: ['ui', 'rest'],
  audit: (i, o) => `CSV import (${i.kind}, ${i.stage}): ${o.committed} rows written, ${o.errorCount} errors`,
  async handler({ db, actor, now }, input) {
    if (input.stage === 'undo') {
      if (!isCoverageKind(input.kind) || !input.batchId) throw new CapabilityError('invalid_input', 'Undo needs a credentials, shifts or hours batchId.');
      const undone = await undoCoverageBatch(db, actor.orgId, input.kind, input.batchId, now);
      return { header: [], mapping: {}, targets: [...TARGETS[input.kind]], rows: [], errorCount: 0, committed: 0, batchId: input.batchId, undone };
    }
    const rows = parseCsv(input.csv);
    if (rows.length < 2) throw new CapabilityError('invalid_input', 'The CSV needs a header row and at least one data row.');
    if (rows.length > 2001) throw new CapabilityError('invalid_input', 'At most 2000 rows per import.');
    const mapping = input.mapping ?? autoMap(input.kind, rows[0]!);
    const today = isoDate(now);
    if (isCoverageKind(input.kind)) {
      const kind = input.kind;
      const missing = TARGETS[kind].filter((t) => t !== 'evidence' && t !== 'issued' && t !== 'expires' && mapping[t] == null);
      if (missing.length) throw new CapabilityError('invalid_input', `Map columns to: ${missing.join(', ')}.`, { header: rows[0] });
      const results = await validateCoverageRows(
        db,
        actor.orgId,
        kind,
        rows.slice(1).map((r, i) => ({ line: i + 2, get: (k: string) => (mapping[k] == null ? '' : (r[mapping[k]!] ?? '').trim()) })),
        (s) => parseDate(s, input.dayFirst),
      );
      const errorCount = results.reduce((n, r) => n + r.errors.length, 0);
      const base = { header: rows[0]!, mapping, targets: [...TARGETS[kind]], rows: results.map(({ line, values, errors }) => ({ line, values, errors })), errorCount, undone: 0 };
      if (input.stage === 'preview' || errorCount > 0) return { ...base, committed: 0, batchId: null };
      const batchId = crypto.randomUUID();
      const committed = await commitCoverageRows(db, actor.orgId, kind, results, batchId, actor.memberId, now);
      return { ...base, committed, batchId };
    }
    const { header, results } = await validate(db, actor.orgId, input.kind, rows, mapping, input.dayFirst, today);
    const errorCount = results.reduce((n, r) => n + r.errors.length, 0);
    const base = { header, mapping, targets: [...TARGETS[input.kind]], rows: results, errorCount };
    if (input.stage === 'preview' || errorCount > 0) return { ...base, committed: 0 };

    const orgId = actor.orgId;
    await db.transaction(async (tx) => {
      const t = tx as unknown as Db;
      if (input.kind === 'members') {
        const teamIds = new Map((await t.select().from(teams).where(eq(teams.orgId, orgId))).map((x) => [x.name.toLowerCase(), x.id]));
        const locs = await t.select().from(locations).where(eq(locations.orgId, orgId));
        const [defaultLoc] = locs;
        const created = new Map<string, string>();
        for (const r of results) {
          const v = r.values;
          let teamId: string | null = null;
          if (v.team) {
            teamId = teamIds.get(v.team.toLowerCase()) ?? null;
            if (!teamId) {
              const [nt] = await t.insert(teams).values({ orgId, name: v.team }).returning();
              teamId = nt!.id;
              teamIds.set(v.team.toLowerCase(), teamId);
            }
          }
          const loc = v.location ? locs.find((l) => l.name.toLowerCase() === v.location!.toLowerCase() || l.countryCode === v.location!.toUpperCase() || `${l.countryCode}-${l.subdivisionCode}` === v.location!.toUpperCase()) : defaultLoc;
          const [m] = await t
            .insert(members)
            .values({ orgId, name: v.name!, email: v.email || null, role: v.role as 'employee', teamId, locationId: loc?.id ?? null, startDate: v.startDate || null, workWeek: v.workWeek!, hoursPerDay: v.hoursPerDay!, tags: v.tags ? v.tags.split(/[;|,]/).map((s) => s.trim()).filter(Boolean) : [] })
            .returning();
          created.set(v.name!.toLowerCase(), m!.id);
        }
        // Managers (may refer to people created above).
        const all = await t.select().from(members).where(and(eq(members.orgId, orgId), isNull(members.deletedAt)));
        for (const r of results) {
          if (!r.values.manager) continue;
          const mgr = all.find((m) => m.name.toLowerCase() === r.values.manager!.toLowerCase() || m.email?.toLowerCase() === r.values.manager!.toLowerCase());
          await t.update(members).set({ managerId: mgr!.id }).where(eq(members.id, created.get(r.values.name!.toLowerCase())!));
        }
        // Starting balances: an import row that makes the engine's balance today equal the file's number.
        const [type] = await t.select().from(leaveTypes).where(and(eq(leaveTypes.orgId, orgId), eq(leaveTypes.key, input.balanceLeaveType)));
        for (const r of results) {
          if (!r.values.balance) continue;
          if (!type) throw new CapabilityError('invalid_input', `Leave type "${input.balanceLeaveType}" not found for balances.`);
          const m = await getMember(t, orgId, created.get(r.values.name!.toLowerCase())!);
          const v = await balanceView(t, orgId, m, type, today);
          const diff = Math.round((Number(r.values.balance) - v.projection.asOf.balance) * 10_000) / 10_000;
          if (diff !== 0) {
            await t.insert(balanceLedger).values({ orgId, memberId: m.id, leaveTypeId: type.id, kind: 'import', amount: String(diff), unit: v.projection.unit, effectiveDate: today, reason: `Imported balance of ${r.values.balance} as of ${today}`, createdByActorType: actor.type, createdByMemberId: actor.memberId });
          }
        }
      } else {
        const types = await t.select().from(leaveTypes).where(eq(leaveTypes.orgId, orgId));
        for (const r of results) {
          const v = r.values;
          const type = types.find((x) => x.key === v.leaveType)!;
          const [req] = await t
            .insert(leaveRequests)
            .values({ orgId, memberId: v.memberId!, leaveTypeId: type.id, status: v.status as 'approved', startDate: v.start!, endDate: v.end!, part: v.part as 'full', engineSnapshot: { amount: Number(v.deducts), unit: v.unit, chargedDates: v.chargedDates ? v.chargedDates.split(' ') : [], excluded: [] }, createdByActorType: actor.type, decidedAt: v.status === 'approved' ? now : null })
            .returning();
          if (v.status === 'approved' && type.countsAgainstBalance && Number(v.deducts) > 0) {
            await t.insert(balanceLedger).values({ orgId, memberId: v.memberId!, leaveTypeId: type.id, kind: 'usage', amount: String(-Number(v.deducts)), unit: v.unit as 'days', effectiveDate: v.start!, requestId: req!.id, reason: 'imported booked leave', createdByActorType: actor.type, createdByMemberId: actor.memberId });
          }
        }
      }
    });
    return { ...base, committed: results.length };
  },
});
