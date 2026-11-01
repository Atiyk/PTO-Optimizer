import {
  coverageForDay,
  hhmm,
  localInterval,
  mergePacks,
  rankCandidates,
  rulesOf,
  type CandidateFacts,
  type Citation,
  type CoverageDayInput,
  type CoverNeed,
  type DemandTemplateRow,
  type MemberCredentialFact,
  type RankedCandidate,
  type RulePack,
  type ShiftInstance,
  type WorkedShift,
} from '@daysoff/engine/coverage/index';
import { CHILDCARE_US_CA, LABOR_US_CA } from '@daysoff/engine/rulepacks';

/*
 * The landing page's hero example: a made-up California centre on one morning, run through
 * the real engine. Required staff and gaps come from `coverageForDay` (requiredStaff.ts),
 * the cover list from `rankCandidates` (ranking.ts), and the rule and its citation from the
 * CA childcare rule pack. Nothing here writes a ratio, a count or a rank by hand: the facts
 * below are inputs (who works when, how many children are booked), the numbers are outputs.
 *
 * Runs on the server only (the page is a server component), so the engine stays out of the
 * client bundle; the grid receives the plain result. Every name is invented ("Example").
 */

export const EXAMPLE = {
  date: '2026-11-12', // a Thursday
  timezone: 'America/Los_Angeles',
  centre: 'Example centre, California',
  /** The grid shows 07:00–13:00. */
  fromMinute: 7 * 60,
  toMinute: 13 * 60,
  callOff: { memberId: 'maya', at: 7 * 60 + 40 },
} as const;

const ROOMS = [
  { id: 'infants', name: 'Infants', group: 'infant' },
  { id: 'toddlers', name: 'Toddlers', group: 'toddler' },
  { id: 'preschool', name: 'Preschool', group: 'preschool' },
] as const;

const NAMES: Record<string, string> = {
  ana: 'Ana',
  ben: 'Ben',
  chris: 'Chris',
  maya: 'Maya',
  eli: 'Eli',
  fay: 'Fay',
  priya: 'Priya',
  jordan: 'Jordan',
  sam: 'Sam',
  lee: 'Lee',
};

/** Credential keys in the example, as people read them. */
const CREDENTIAL_LABELS: Record<string, string> = { teacher_permit: 'teacher permit' };

/** Children booked per room (counts only, never child data). Thursday = weekday 3. */
const DEMAND: [room: string, group: string, from: string, to: string, count: number][] = [
  ['infants', 'infant', '07:00', '13:00', 7],
  ['toddlers', 'toddler', '07:00', '09:00', 6],
  ['toddlers', 'toddler', '09:00', '11:30', 12],
  ['toddlers', 'toddler', '11:30', '13:00', 6],
  ['preschool', 'preschool', '07:00', '08:30', 10],
  ['preschool', 'preschool', '08:30', '13:00', 20],
];

/** Shifts this week (Mon 9 – Thu 12 Nov). Rooms matter only on the example day. */
const SHIFTS: [member: string, room: string, date: string, from: string, to: string][] = [
  ['ana', 'infants', '2026-11-12', '07:00', '15:00'],
  ['ben', 'infants', '2026-11-12', '07:00', '15:00'],
  ['chris', 'toddlers', '2026-11-12', '07:00', '15:00'],
  ['maya', 'toddlers', '2026-11-12', '09:00', '11:30'],
  ['eli', 'preschool', '2026-11-12', '07:00', '15:00'],
  ['fay', 'preschool', '2026-11-12', '08:30', '16:30'],
  ['jordan', 'preschool', '2026-11-12', '13:00', '18:00'],
  ...(['2026-11-09', '2026-11-10', '2026-11-11'] as const).flatMap((d) => [
    ['jordan', 'preschool', d, '07:00', '15:00'] as [string, string, string, string, string],
    ['sam', 'preschool', d, '07:00', '15:00'] as [string, string, string, string, string],
  ]),
  ['priya', 'toddlers', '2026-11-09', '07:00', '15:00'],
  ['priya', 'toddlers', '2026-11-10', '07:00', '15:00'],
];

/** Cover preferences and the fairness ledger (covers taken in the last 90 days). */
const PEOPLE: [member: string, optIn: CandidateFacts['optIn'], coverTaken: number, permitExpires: string | null][] = [
  ['ana', 'ask', 0, null],
  ['ben', 'ask', 1, null],
  ['chris', 'yes', 0, null],
  ['maya', 'ask', 0, null],
  ['eli', 'ask', 0, null],
  ['fay', 'ask', 0, null],
  ['priya', 'yes', 0, null],
  ['jordan', 'ask', 1, null],
  ['sam', 'yes', 2, null],
  ['lee', 'yes', 0, '2026-10-31'],
];

/** The example centre's own policy (not law): only permit holders count in ratio. */
const CENTRE_POLICY: Pick<RulePack, 'ageGroups' | 'rules'> = {
  ageGroups: [],
  rules: [{ id: 'example-permit', label: 'Only staff with a valid teacher permit count in ratio (centre policy)', kind: 'ratio_counts_credential', anyOf: ['teacher_permit'], basis: 'org_policy' }],
};

export const EXAMPLE_PACK = mergePacks([CHILDCARE_US_CA, LABOR_US_CA, CENTRE_POLICY]);

const min = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
const iv = (date: string, from: string, to: string) => localInterval(date, min(from), min(to), EXAMPLE.timezone);

const credentials = new Map<string, MemberCredentialFact[]>(PEOPLE.map(([id, , , exp]) => [id, [{ key: 'teacher_permit', issuedOn: '2024-01-15', expiresOn: exp }]]));

/** The engine input for the example day, before or after the call-off. */
export function exampleDayInput(afterCallOff: boolean): CoverageDayInput {
  const demand: DemandTemplateRow[] = DEMAND.map(([roomId, group, from, to, count]) => ({ roomId, weekday: 3, startMinute: min(from), endMinute: min(to), group, count }));
  const shifts: ShiftInstance[] = SHIFTS.filter(([, , d]) => d === EXAMPLE.date).map(([memberId, roomId, d, from, to]) => ({ memberId, roomId, interval: iv(d, from, to) }));
  return {
    pack: EXAMPLE_PACK,
    date: EXAMPLE.date,
    timezone: EXAMPLE.timezone,
    rooms: ROOMS.map((r) => ({ id: r.id, name: r.name })),
    demand,
    shifts,
    absences: afterCallOff ? [{ memberId: EXAMPLE.callOff.memberId, interval: iv(EXAMPLE.date, '00:00', '23:59'), status: 'approved' }] : [],
    credentials,
  };
}

/** Every candidate's facts, as the app's `rankForTarget` builds them. */
export function exampleCandidates(): CandidateFacts[] {
  return PEOPLE.map(([memberId, optIn, coverTaken]) => ({
    memberId,
    active: true,
    homeSiteId: 'example',
    optIn,
    shifts: SHIFTS.filter(([m]) => m === memberId).map(([, , date, from, to]): WorkedShift => ({ date, interval: iv(date, from, to), siteId: 'example' })),
    absences: memberId === EXAMPLE.callOff.memberId ? [{ interval: iv(EXAMPLE.date, '00:00', '23:59'), status: 'approved' }] : [],
    credentials: credentials.get(memberId) ?? [],
    fairness: { coverTaken, holidayCover: 0, shortNotice: 0 },
    overtimeExempt: false,
  }));
}

export interface HeroSource {
  /** Short chip text, e.g. "Cal. H&S Code § 1596.955(a)(3)–(4)". */
  label: string;
  regulation: string;
  section: string;
  url: string;
  retrievedOn: string;
  publisher: Citation['publisher'];
  quote: string | null;
}

export interface HeroCell {
  minute: number;
  time: string;
  required: number;
  /** Staff counted in ratio before the call-off. */
  before: number;
  after: number;
}

export interface HeroRoom {
  id: string;
  name: string;
  cells: HeroCell[];
}

export interface HeroOption {
  rank: number;
  name: string;
  reason: string;
}

export interface HeroExampleData {
  centre: string;
  dayLabel: string;
  state: string;
  gridFrom: string;
  gridTo: string;
  event: { name: string; room: string; time: string };
  rooms: HeroRoom[];
  gap: {
    roomId: string;
    roomName: string;
    from: string;
    to: string;
    required: number;
    present: number;
    children: number;
    childrenPerStaff: number;
    rule: string;
    source: HeroSource;
  };
  options: HeroOption[];
  skipped: { name: string; reason: string } | null;
  /** Eligible people ranked below the options shown. */
  moreEligible: number;
  /** People already working at that time (not offered). */
  busy: number;
}

/** "Cal. Health & Safety Code (as amended …)" → "Cal. H&S Code", for the chip. */
export function shortSource(c: Citation): string {
  const reg = c.regulation.replace(/\s*\(.*\)\s*$/, '').replace('Health & Safety Code', 'H&S Code').replace('Code Regs. tit.', 'tit.');
  return `${reg} ${c.section}`;
}

function reasonFor(c: RankedCandidate): string {
  const parts: string[] = [];
  const cred = c.checks.find((x) => x.id === 'credential_valid');
  if (cred?.passed) parts.push(cred.detail.startsWith('No credential') ? 'Free at that time' : 'Qualified');
  const ot = c.checks.find((x) => x.id === 'overtime');
  const week = ot?.detail.match(/^([\d.]+) h this week/)?.[1] ?? ot?.detail.match(/reach ([\d.]+) h/)?.[1];
  if (week) parts.push(`${week} h this week with the cover`);
  parts.push(c.costBand === 'regular' ? 'regular time' : 'overtime');
  return parts.join(', ');
}

function fairnessNote(memberId: string): string {
  const n = PEOPLE.find(([id]) => id === memberId)?.[2] ?? 0;
  return n === 0 ? 'no covers in the last 90 days' : `${n} ${n === 1 ? 'cover' : 'covers'} in the last 90 days`;
}

/** The whole hero example: coverage before and after the call-off, the gap, ranked cover. */
export function buildHeroExample(): HeroExampleData {
  const before = coverageForDay(exampleDayInput(false));
  const after = coverageForDay(exampleDayInput(true));
  const inView = (m: number) => m >= EXAMPLE.fromMinute && m < EXAMPLE.toMinute;

  const rooms: HeroRoom[] = ROOMS.map((room) => ({
    id: room.id,
    name: room.name,
    cells: after.rooms
      .filter((rb) => rb.roomId === room.id && rb.block.fold === 0 && inView(rb.block.startMinute))
      .map((rb) => {
        const b = before.rooms.find((x) => x.roomId === room.id && x.block.key === rb.block.key)!;
        return { minute: rb.block.startMinute, time: hhmm(rb.block.startMinute), required: rb.required, before: b.present, after: rb.present };
      }),
  }));

  // The gap the call-off created: contiguous blocks with a ratio shortfall.
  const gapBlocks = after.rooms.filter((rb) => rb.gap > 0 && inView(rb.block.startMinute));
  const first = gapBlocks[0];
  const last = gapBlocks[gapBlocks.length - 1];
  if (!first || !last) throw new Error('hero example: the call-off should create a gap');
  const shortfall = first.shortfalls.find((s) => s.kind === 'ratio')!;
  const ratio = rulesOf(EXAMPLE_PACK, 'ratio').find((r) => r.id === shortfall.ruleId)!;
  if (!ratio.citation) throw new Error('hero example: the ratio rule must be cited');
  const roomName = ROOMS.find((r) => r.id === first.roomId)!.name;

  const need: CoverNeed = {
    siteId: 'example',
    roomId: first.roomId,
    date: EXAMPLE.date,
    interval: { start: first.block.utcStart, end: last.block.utcEnd },
    credentials: rulesOf(EXAMPLE_PACK, 'ratio_counts_credential').map((r) => ({ anyOf: r.anyOf, ruleId: r.id, provenance: r })),
    absentMemberId: EXAMPLE.callOff.memberId,
    isHoliday: false,
    requestedAt: localInterval(EXAMPLE.date, EXAMPLE.callOff.at, EXAMPLE.callOff.at + 1, EXAMPLE.timezone).start,
  };
  const ranked = rankCandidates(need, exampleCandidates(), { pack: EXAMPLE_PACK, costAware: false, overtimePolicy: 'avoid' });
  const eligible = ranked.filter((c) => c.eligible);
  const shown = eligible.slice(0, 3);
  // "Skipped" = the first person excluded for a reason other than being the absent person
  // or already working then (those are obvious and listed as a count).
  const excluded = ranked.filter((c) => !c.eligible && c.excludedBy !== 'active');
  const skippedC = excluded.find((c) => c.excludedBy !== 'available');
  const skippedCheck = skippedC?.checks.find((x) => x.id === skippedC.excludedBy);
  let skippedReason = skippedCheck?.detail ?? '';
  for (const [k, label] of Object.entries(CREDENTIAL_LABELS)) skippedReason = skippedReason.replace(k, label.charAt(0).toUpperCase() + label.slice(1));

  return {
    centre: EXAMPLE.centre,
    dayLabel: 'Thursday',
    state: 'California',
    gridFrom: hhmm(EXAMPLE.fromMinute),
    gridTo: hhmm(EXAMPLE.toMinute),
    event: { name: NAMES[EXAMPLE.callOff.memberId]!, room: roomName, time: hhmm(EXAMPLE.callOff.at) },
    rooms,
    gap: {
      roomId: first.roomId,
      roomName,
      from: hhmm(first.block.startMinute),
      to: hhmm(last.block.startMinute + (last.block.utcEnd - last.block.utcStart) / 60_000),
      required: shortfall.required,
      present: shortfall.present,
      children: first.children,
      childrenPerStaff: ratio.childrenPerStaff,
      rule: ratio.label,
      source: {
        label: shortSource(ratio.citation),
        regulation: ratio.citation.regulation,
        section: ratio.citation.section,
        url: ratio.citation.url,
        retrievedOn: ratio.citation.retrievedOn,
        publisher: ratio.citation.publisher,
        quote: ratio.citation.quote ?? null,
      },
    },
    options: shown.map((c) => ({ rank: c.rank!, name: NAMES[c.memberId]!, reason: `${reasonFor(c)}; ${fairnessNote(c.memberId)}` })),
    skipped: skippedC ? { name: NAMES[skippedC.memberId]!, reason: skippedReason } : null,
    moreEligible: eligible.length - shown.length,
    busy: excluded.filter((c) => c.excludedBy === 'available').length,
  };
}

export interface CallOffStepCell {
  minute: number;
  time: string;
  required: number;
  /** Staff counted before the call-off, after it, and after the cover was accepted. */
  before: number;
  after: number;
  filled: number;
}

export interface CallOffStepsData {
  hero: HeroExampleData;
  /** The same rooms as the hero, cut to the hours around the gap. */
  rooms: { id: string; name: string; cells: CallOffStepCell[] }[];
  accepted: { name: string; reason: string };
}

/**
 * The call-off step-through (landing page section 2): the hero's example, plus what the engine
 * says once the top-ranked person accepts and works the gap in the gap room. Every count is an
 * engine output: the accepted cover is an input (one more shift), the counts are recomputed.
 */
export function buildCallOffSteps(): CallOffStepsData {
  const hero = buildHeroExample();
  const pick = hero.options[0];
  if (!pick) throw new Error('call-off steps: the example needs at least one eligible person');
  const memberId = Object.entries(NAMES).find(([, n]) => n === pick.name)![0];
  const gapRoom = hero.rooms.find((r) => r.id === hero.gap.roomId)!;
  const gapCells = gapRoom.cells.filter((c) => c.after < c.required);
  const from = gapCells[0]!.minute;
  const to = gapCells.at(-1)!.minute + 30;

  const filledInput = exampleDayInput(true);
  const filled = coverageForDay({
    ...filledInput,
    shifts: [...filledInput.shifts, { memberId, roomId: hero.gap.roomId, interval: localInterval(EXAMPLE.date, from, to, EXAMPLE.timezone) }],
  });

  // One hour either side of the gap, so the before/after edges are visible.
  const lo = from - 60;
  const hi = to + 60;
  const rooms = hero.rooms.map((room) => ({
    id: room.id,
    name: room.name,
    cells: room.cells
      .filter((c) => c.minute >= lo && c.minute < hi)
      .map((c) => {
        const f = filled.rooms.find((rb) => rb.roomId === room.id && rb.block.fold === 0 && rb.block.startMinute === c.minute)!;
        return { ...c, filled: f.present };
      }),
  }));
  return { hero, rooms, accepted: { name: pick.name, reason: pick.reason } };
}
