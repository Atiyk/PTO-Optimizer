import { addDays, mondayIndexedDow } from '../solver/dateUtils';
import type { ISODate } from '../solver/types';
import { holdsValid, type MemberCredentialFact } from './requiredStaff';
import { hoursIn, overlaps, type Interval } from './timeBlocks';
import { rulesOf, type Provenance, type RulePack } from './types';
import { projectOvertime } from '../timeclock/overtime';

/*
 * Cover ranking (COVERAGE-SPEC §4): hard filters H1–H10, then a deterministic integer
 * score (lower is better) with a member-id tie-break. Every candidate carries every check
 * it went through, so explanations come from engine facts only. Pay rates never appear in
 * the output: only a cost band.
 */

export interface CoverNeed {
  siteId: string;
  roomId: string;
  /** Local date the cover starts on. */
  date: ISODate;
  interval: Interval;
  /** Each entry is satisfied by holding any one of its credentials (valid on `date`). */
  credentials: readonly { anyOf: readonly string[]; ruleId: string; provenance: Provenance }[];
  /** The member whose absence made the gap (never a candidate). */
  absentMemberId?: string | null;
  /** True when the date is a public holiday at the site. */
  isHoliday?: boolean;
  /** When the request is made; < 24 h before the cover counts as short notice. */
  requestedAt?: number;
}

export interface WorkedShift {
  /** Local start date of the shift. */
  date: ISODate;
  interval: Interval;
  siteId?: string;
}

export interface CandidateFacts {
  memberId: string;
  active: boolean;
  homeSiteId: string | null;
  /** Extra sites the member agreed to cover. */
  allowedSiteIds?: readonly string[];
  optIn: 'yes' | 'no' | 'ask';
  shifts: readonly WorkedShift[];
  absences: readonly { interval: Interval; status: 'approved' | 'pending' }[];
  credentials: readonly MemberCredentialFact[];
  /** From the fairness ledger (filled cover events), rolling 90 days. */
  fairness: { coverTaken: number; holidayCover: number; shortNotice: number };
}

/**
 * What to do with a candidate the cover would push into overtime:
 * `allow` ranks as before (a cost penalty only when cost-aware), `avoid` keeps them eligible
 * but after everyone who stays at regular time, `exclude` makes overtime a hard filter.
 */
export type OvertimePolicy = 'allow' | 'avoid' | 'exclude';

export interface RankingOptions {
  pack: Pick<RulePack, 'rules'>;
  costAware?: boolean;
  /** Default `allow` (the behaviour before overtime policies existed). */
  overtimePolicy?: OvertimePolicy;
}

export type CheckId =
  | 'active'
  | 'site_allowed'
  | 'opted_in'
  | 'not_on_leave'
  | 'available'
  | 'credential_valid'
  | 'min_rest'
  | 'max_hours_day'
  | 'max_hours_week'
  | 'max_consecutive_days'
  | 'overtime';

export interface Check {
  id: CheckId;
  passed: boolean;
  /** Plain facts with engine numbers; never user text. */
  detail: string;
  ruleId?: string;
  provenance?: Provenance;
}

export interface RankedCandidate {
  memberId: string;
  eligible: boolean;
  checks: Check[];
  /** First failing check, for one-line "excluded because". */
  excludedBy: CheckId | null;
  score: number | null;
  scoreParts: { fairness: number; preference: number; cost: number; travel: number } | null;
  costBand: 'regular' | 'overtime';
  coverHours: number;
  /** Premium hours this cover adds (hours only, never pay). */
  overtimeHours: number;
  doubleTimeHours: number;
  rank: number | null;
}

export const SCORE_WEIGHTS = {
  coverTaken: 100,
  holidayCover: 50,
  shortNotice: 30,
  optInYes: -40,
  overtime: 200,
  /** `avoid` policy: larger than any realistic fairness score, so overtime ranks last. */
  overtimeAvoid: 100_000,
  otherSite: 25,
} as const;

const DAY_MS = 86_400_000;
const r2 = (n: number) => Math.round(n * 100) / 100;

function weekStart(date: ISODate): ISODate {
  return addDays(date, -mondayIndexedDow(date));
}

/** Evaluate one candidate against every hard filter and score it. */
export function evaluateCandidate(need: CoverNeed, c: CandidateFacts, opts: RankingOptions): RankedCandidate {
  const checks: Check[] = [];
  const coverHours = r2(hoursIn(need.interval));
  const push = (id: CheckId, passed: boolean, detail: string, extra: Partial<Check> = {}) => checks.push({ id, passed, detail, ...extra });

  push('active', c.active && c.memberId !== need.absentMemberId, c.memberId === need.absentMemberId ? 'This is the absent person' : c.active ? 'Active member' : 'Not an active member');

  const siteOk = c.homeSiteId === need.siteId || !!c.allowedSiteIds?.includes(need.siteId);
  push('site_allowed', siteOk, siteOk ? (c.homeSiteId === need.siteId ? 'Home site' : 'Agreed to cover this site') : 'Not set up to cover this site');

  push('opted_in', c.optIn !== 'no', c.optIn === 'no' ? 'Opted out of cover offers' : c.optIn === 'yes' ? 'Opted in to cover offers' : 'Will be asked');

  const leave = c.absences.find((a) => overlaps(a.interval, need.interval));
  push('not_on_leave', !leave, leave ? `Has ${leave.status} leave at that time` : 'No leave at that time');

  const clash = c.shifts.find((s) => overlaps(s.interval, need.interval));
  push('available', !clash, clash ? 'Already scheduled at an overlapping time' : 'Not scheduled at that time');

  const missing = need.credentials.filter((req) => !req.anyOf.some((k) => holdsValid(c.credentials, k, need.date)));
  if (need.credentials.length === 0) push('credential_valid', true, 'No credential needed');
  else if (missing.length === 0) push('credential_valid', true, `Holds a valid ${need.credentials.map((r) => r.anyOf.join(' or ')).join(' and ')} on ${need.date}`);
  else {
    const m = missing[0]!;
    const expired = c.credentials.find((x) => m.anyOf.includes(x.key) && x.expiresOn && x.expiresOn <= need.date);
    push(
      'credential_valid',
      false,
      expired ? `${expired.key} expired on ${expired.expiresOn}` : `No valid ${m.anyOf.join(' or ')} on ${need.date}`,
      { ruleId: m.ruleId, provenance: m.provenance },
    );
  }

  // Work-time rules from the pack (law or org policy).
  const rest = rulesOf(opts.pack, 'min_rest_between_shifts')[0];
  if (rest) {
    // A shift that runs straight into (or on from) the cover is the same stretch of work, not
    // "0 h rest": join them, then measure rest from that whole stretch to the other shifts.
    let block = { ...need.interval };
    const joined = new Set<number>();
    for (let grew = true; grew; ) {
      grew = false;
      for (const [i, s] of c.shifts.entries()) {
        if (joined.has(i) || overlaps(s.interval, block)) continue;
        if (s.interval.end === block.start || s.interval.start === block.end) {
          block = { start: Math.min(block.start, s.interval.start), end: Math.max(block.end, s.interval.end) };
          joined.add(i);
          grew = true;
        }
      }
    }
    let minGap = Infinity;
    for (const [i, s] of c.shifts.entries()) {
      if (joined.has(i) || overlaps(s.interval, block)) continue;
      const gap = s.interval.end <= block.start ? block.start - s.interval.end : s.interval.start - block.end;
      if (gap >= 0) minGap = Math.min(minGap, gap / 3_600_000);
    }
    const ok = minGap >= rest.hours;
    push('min_rest', ok, minGap === Infinity ? `No adjacent shift; minimum rest ${rest.hours} h` : `${r2(minGap)} h rest next to the cover; minimum ${rest.hours} h`, { ruleId: rest.id, provenance: rest });
  }

  const dayHours = r2(c.shifts.filter((s) => s.date === need.date).reduce((h, s) => h + hoursIn(s.interval), 0) + coverHours);
  const maxDay = rulesOf(opts.pack, 'max_hours_per_day')[0];
  if (maxDay) push('max_hours_day', dayHours <= maxDay.hours, `${dayHours} h on ${need.date} with the cover; maximum ${maxDay.hours} h`, { ruleId: maxDay.id, provenance: maxDay });

  const ws = weekStart(need.date);
  const we = addDays(ws, 6);
  const weekHours = r2(c.shifts.filter((s) => s.date >= ws && s.date <= we).reduce((h, s) => h + hoursIn(s.interval), 0) + coverHours);
  const maxWeek = rulesOf(opts.pack, 'max_hours_per_week')[0];
  if (maxWeek) push('max_hours_week', weekHours <= maxWeek.hours, `${weekHours} h in the week of ${ws} with the cover; maximum ${maxWeek.hours} h`, { ruleId: maxWeek.id, provenance: maxWeek });

  const maxRun = rulesOf(opts.pack, 'max_consecutive_days')[0];
  if (maxRun) {
    const worked = new Set(c.shifts.map((s) => s.date));
    worked.add(need.date);
    let run = 1;
    for (let d = addDays(need.date, -1); worked.has(d); d = addDays(d, -1)) run++;
    for (let d = addDays(need.date, 1); worked.has(d); d = addDays(d, 1)) run++;
    push('max_consecutive_days', run <= maxRun.days, `${run} days in a row with the cover; maximum ${maxRun.days}`, { ruleId: maxRun.id, provenance: maxRun });
  }

  // Overtime from the real week (daily, weekly, double time, 7th day): the premium hours this
  // cover adds on top of the shifts already worked or scheduled that week.
  const ot = rulesOf(opts.pack, 'overtime_flag')[0];
  const policy = opts.overtimePolicy ?? 'allow';
  let overtimeHours = 0;
  let doubleTimeHours = 0;
  if (ot) {
    const days = c.shifts.filter((s) => s.date >= ws && s.date <= we).map((s) => ({ date: s.date, hours: hoursIn(s.interval) }));
    const p = projectOvertime(days, { date: need.date, hours: coverHours }, ot);
    overtimeHours = p.addedOvertime;
    doubleTimeHours = p.addedDoubleTime;
    const adds = overtimeHours > 0 || doubleTimeHours > 0;
    push('overtime', policy !== 'exclude' || !adds, policy === 'avoid' && adds ? `${p.detail}; ranked after people at regular time` : p.detail, { ruleId: ot.id, provenance: ot });
  }
  const overtime = overtimeHours > 0 || doubleTimeHours > 0;
  const costBand = overtime ? 'overtime' : 'regular';

  const failed = checks.find((x) => !x.passed);
  if (failed) {
    return { memberId: c.memberId, eligible: false, checks, excludedBy: failed.id, score: null, scoreParts: null, costBand, coverHours, overtimeHours, doubleTimeHours, rank: null };
  }
  const W = SCORE_WEIGHTS;
  const scoreParts = {
    fairness: W.coverTaken * c.fairness.coverTaken + W.holidayCover * c.fairness.holidayCover + W.shortNotice * c.fairness.shortNotice,
    preference: c.optIn === 'yes' ? W.optInYes : 0,
    cost: overtime ? (policy === 'avoid' ? W.overtimeAvoid : opts.costAware ? W.overtime : 0) : 0,
    travel: c.homeSiteId === need.siteId ? 0 : W.otherSite,
  };
  const score = scoreParts.fairness + scoreParts.preference + scoreParts.cost + scoreParts.travel;
  return { memberId: c.memberId, eligible: true, checks, excludedBy: null, score, scoreParts, costBand, coverHours, overtimeHours, doubleTimeHours, rank: null };
}

/** Rank every candidate: eligible ones by score then member id; excluded ones after, by id. */
export function rankCandidates(need: CoverNeed, candidates: readonly CandidateFacts[], opts: RankingOptions): RankedCandidate[] {
  const all = candidates.map((c) => evaluateCandidate(need, c, opts));
  const byId = (a: RankedCandidate, b: RankedCandidate) => (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0);
  const eligible = all.filter((c) => c.eligible).sort((a, b) => a.score! - b.score! || byId(a, b));
  eligible.forEach((c, i) => (c.rank = i + 1));
  const excluded = all.filter((c) => !c.eligible).sort(byId);
  return [...eligible, ...excluded];
}

/** True when a cover starts less than 24 hours after it was requested. */
export function isShortNotice(need: Pick<CoverNeed, 'interval' | 'requestedAt'>): boolean {
  return need.requestedAt != null && need.interval.start - need.requestedAt < DAY_MS;
}
