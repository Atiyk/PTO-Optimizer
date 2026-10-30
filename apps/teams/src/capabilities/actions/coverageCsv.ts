import { and, eq, isNull } from 'drizzle-orm';
import { parseHhmm } from '@daysoff/engine/coverage/timeBlocks';
import type { Db } from '@/db/client';
import { CapabilityError } from '../errors';
import { credentials, hoursWorked, memberCredentials, members, rooms, shiftTemplates } from '@/db/schema';

/*
 * Coverage imports (staff credentials, weekly schedules, hours worked) for `importCsv` and
 * `importHoursWorked`. Same contract as the MVP import: validate every row first, write all
 * rows in one transaction or none; each commit carries a batch id so it can be undone.
 */

export const COVERAGE_TARGETS = {
  credentials: ['member', 'credential', 'issued', 'expires', 'evidence'],
  shifts: ['member', 'room', 'day', 'start', 'end'],
  hours: ['member', 'periodStart', 'periodEnd', 'hours'],
} as const;
export type CoverageKind = keyof typeof COVERAGE_TARGETS;

export const COVERAGE_SYNONYMS: Record<string, string[]> = {
  credential: ['credential', 'certificate', 'certification', 'qualification', 'licence', 'license', 'cert'],
  issued: ['issued', 'issued on', 'issue date', 'date issued', 'obtained'],
  expires: ['expires', 'expires on', 'expiry', 'expiry date', 'expiration', 'expiration date', 'valid until'],
  evidence: ['evidence', 'evidence ref', 'where kept', 'location of certificate', 'notes'],
  room: ['room', 'post', 'classroom', 'area'],
  day: ['day', 'weekday', 'day of week'],
  start: ['start', 'start time', 'from', 'shift start', 'in'],
  end: ['end', 'end time', 'to', 'shift end', 'out'],
  periodStart: ['period start', 'pay period start', 'from', 'start', 'week start'],
  periodEnd: ['period end', 'pay period end', 'to', 'end', 'week end', 'week ending'],
  hours: ['hours', 'hours worked', 'total hours', 'worked hours', 'regular hours'],
};

export interface CoverageRowValues {
  memberId?: string;
  credentialKey?: string;
  credentialName?: string;
  issuedOn?: string | null;
  expiresOn?: string | null;
  evidenceRef?: string | null;
  roomId?: string;
  weekday?: number;
  startMinute?: number;
  endMinute?: number;
  periodStart?: string;
  periodEnd?: string;
  hours?: number;
}

export interface CoverageRowResult {
  line: number;
  values: Record<string, string>;
  parsed: CoverageRowValues;
  errors: string[];
}

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const slugKey = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);

function time(s: string): number | null {
  try {
    const t = s.trim().toLowerCase();
    const ampm = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(t);
    if (ampm) {
      let h = Number(ampm[1]) % 12;
      if (ampm[3] === 'pm') h += 12;
      return h * 60 + Number(ampm[2] ?? 0);
    }
    return parseHhmm(t);
  } catch {
    return null;
  }
}

/** Validate one kind of coverage rows (already mapped to target names). */
export async function validateCoverageRows(
  db: Db,
  orgId: string,
  kind: CoverageKind,
  rows: { line: number; get: (k: string) => string }[],
  parseDate: (s: string) => string | null,
): Promise<CoverageRowResult[]> {
  const people = await db.select().from(members).where(and(eq(members.orgId, orgId), isNull(members.deletedAt)));
  const roomRows = kind === 'shifts' ? await db.select().from(rooms).where(and(eq(rooms.orgId, orgId), isNull(rooms.archivedAt))) : [];
  const creds = kind === 'credentials' ? await db.select().from(credentials).where(eq(credentials.orgId, orgId)) : [];
  const out: CoverageRowResult[] = [];
  for (const { line, get } of rows) {
    const errors: string[] = [];
    const values: Record<string, string> = {};
    const parsed: CoverageRowValues = {};
    const who = get('member');
    values.member = who;
    const m = people.find((x) => x.id === who || x.name.toLowerCase() === who.toLowerCase() || (x.email && x.email.toLowerCase() === who.toLowerCase()));
    if (!m) errors.push(`member "${who}" not found (add people first)`);
    else parsed.memberId = m.id;

    if (kind === 'credentials') {
      const c = get('credential');
      values.credential = c;
      if (!c) errors.push('credential is empty');
      const existing = creds.find((x) => x.key === c.toLowerCase() || x.name.toLowerCase() === c.toLowerCase());
      parsed.credentialKey = existing?.key ?? slugKey(c);
      parsed.credentialName = existing?.name ?? c;
      for (const [field, key] of [
        ['issued', 'issuedOn'],
        ['expires', 'expiresOn'],
      ] as const) {
        const raw = get(field);
        values[field] = raw;
        if (!raw) parsed[key] = null;
        else {
          const d = parseDate(raw);
          if (!d) errors.push(`${field} "${raw}" is not a date`);
          parsed[key] = d;
        }
      }
      if (parsed.issuedOn && parsed.expiresOn && parsed.expiresOn < parsed.issuedOn) errors.push('expires is before issued');
      const ev = get('evidence');
      values.evidence = ev;
      parsed.evidenceRef = ev ? ev.slice(0, 200) : null;
    } else if (kind === 'shifts') {
      const r = get('room');
      values.room = r;
      const room = roomRows.find((x) => x.id === r || x.name.toLowerCase() === r.toLowerCase());
      if (!room) errors.push(`room "${r}" not found (add rooms in Coverage setup first)`);
      else parsed.roomId = room.id;
      const d = get('day');
      values.day = d;
      const wd = DAYS.indexOf(d.trim().toLowerCase().slice(0, 3));
      if (wd < 0) errors.push(`day "${d}" is not a weekday (Mon–Sun)`);
      else parsed.weekday = wd;
      const s = time(get('start'));
      const e = time(get('end'));
      values.start = get('start');
      values.end = get('end');
      if (s == null) errors.push(`start "${get('start')}" is not a time`);
      if (e == null) errors.push(`end "${get('end')}" is not a time`);
      if (s != null && e != null) {
        parsed.startMinute = s;
        parsed.endMinute = e >= 1440 ? 0 : e;
        if (s === e) errors.push('start and end are the same');
      }
    } else {
      const ps = parseDate(get('periodStart'));
      const pe = parseDate(get('periodEnd'));
      values.periodStart = get('periodStart');
      values.periodEnd = get('periodEnd');
      if (!ps) errors.push(`period start "${get('periodStart')}" is not a date`);
      if (!pe) errors.push(`period end "${get('periodEnd')}" is not a date`);
      if (ps && pe && pe < ps) errors.push('period end is before period start');
      if (ps && pe && (Date.parse(pe) - Date.parse(ps)) / 86_400_000 > 31) errors.push('a period can be at most 31 days');
      parsed.periodStart = ps ?? undefined;
      parsed.periodEnd = pe ?? undefined;
      const h = Number(get('hours'));
      values.hours = get('hours');
      if (!Number.isFinite(h) || h < 0 || h > 744) errors.push(`hours "${get('hours')}" must be a number from 0 to 744`);
      else parsed.hours = Math.round(h * 100) / 100;
    }
    out.push({ line, values, parsed, errors });
  }
  if (kind === 'hours') {
    // The same member and period twice in one file is almost always a mistake.
    const seen = new Set<string>();
    for (const r of out) {
      const k = `${r.parsed.memberId}|${r.parsed.periodStart}|${r.parsed.periodEnd}`;
      if (r.parsed.memberId && seen.has(k)) r.errors.push('duplicate member and period in this file');
      seen.add(k);
    }
  }
  return out;
}

/** Write validated rows in one transaction under `batchId`. Returns rows written. */
export async function commitCoverageRows(db: Db, orgId: string, kind: CoverageKind, rows: CoverageRowResult[], batchId: string, verifiedBy: string | null, now: Date): Promise<number> {
  await db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    if (kind === 'credentials') {
      const existing = new Map((await t.select().from(credentials).where(eq(credentials.orgId, orgId))).map((c) => [c.key, c.id]));
      for (const r of rows) {
        const p = r.parsed;
        let credId = existing.get(p.credentialKey!);
        if (!credId) {
          const [c] = await t.insert(credentials).values({ orgId, key: p.credentialKey!, name: p.credentialName! }).returning();
          credId = c!.id;
          existing.set(p.credentialKey!, credId);
        }
        await t.insert(memberCredentials).values({
          orgId,
          memberId: p.memberId!,
          credentialId: credId,
          issuedOn: p.issuedOn ?? null,
          expiresOn: p.expiresOn ?? null,
          evidenceRef: p.evidenceRef ?? null,
          verifiedByMemberId: verifiedBy,
          verifiedAt: verifiedBy ? now : null,
          importBatchId: batchId,
        });
      }
    } else if (kind === 'shifts') {
      for (const r of rows) {
        const p = r.parsed;
        await t.insert(shiftTemplates).values({ orgId, memberId: p.memberId!, roomId: p.roomId!, weekday: p.weekday!, startMinute: p.startMinute!, endMinute: p.endMinute!, importBatchId: batchId });
      }
    } else {
      for (const r of rows) {
        const p = r.parsed;
        await t.insert(hoursWorked).values({ orgId, memberId: p.memberId!, periodStart: p.periodStart!, periodEnd: p.periodEnd!, hours: String(p.hours!), importBatchId: batchId });
      }
    }
  });
  return rows.length;
}

/** Undo a committed batch: hours are voided (append-only), schedule and credential rows removed. */
export async function undoCoverageBatch(db: Db, orgId: string, kind: CoverageKind, batchId: string, now: Date): Promise<number> {
  const n = await undoRows(db, orgId, kind, batchId, now);
  if (n === 0 && kind === 'hours') {
    // Undoing twice is fine; a batch id this org never wrote is not.
    const [seen] = await db.select({ id: hoursWorked.id }).from(hoursWorked).where(and(eq(hoursWorked.orgId, orgId), eq(hoursWorked.importBatchId, batchId))).limit(1);
    if (!seen) throw new CapabilityError('not_found', 'No import batch with that id in this organization.');
  }
  if (n === 0 && kind !== 'hours') throw new CapabilityError('not_found', 'No import batch with that id in this organization (or it was already undone).');
  return n;
}

async function undoRows(db: Db, orgId: string, kind: CoverageKind, batchId: string, now: Date): Promise<number> {
  if (kind === 'hours') {
    const r = await db
      .update(hoursWorked)
      .set({ voidedAt: now })
      .where(and(eq(hoursWorked.orgId, orgId), eq(hoursWorked.importBatchId, batchId), isNull(hoursWorked.voidedAt)))
      .returning({ id: hoursWorked.id });
    return r.length;
  }
  if (kind === 'shifts') {
    const r = await db.delete(shiftTemplates).where(and(eq(shiftTemplates.orgId, orgId), eq(shiftTemplates.importBatchId, batchId))).returning({ id: shiftTemplates.id });
    return r.length;
  }
  const r = await db.delete(memberCredentials).where(and(eq(memberCredentials.orgId, orgId), eq(memberCredentials.importBatchId, batchId))).returning({ id: memberCredentials.id });
  return r.length;
}
