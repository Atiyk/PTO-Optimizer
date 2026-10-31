import { describe, expect, it } from 'vitest';
import { LABOR_US_CA, LABOR_US_CO, LABOR_US_FEDERAL, LABOR_US_NY, LABOR_US_WA } from '../../rulepacks/labor';
import { localInterval, zonedToUtc } from '../coverage/timeBlocks';
import { rankCandidates, type CandidateFacts, type CoverNeed } from '../coverage/ranking';
import { checkBreaks, restBreaksOwed } from './breaks';
import { timesheetWeek, workRulesOf } from './compliance';
import { overtimeForWeek, projectOvertime, workweekStart } from './overtime';
import { allowedNext, foldPunches, hoursByDate, type Punch } from './punches';

const LA = 'America/Los_Angeles';
const NYC = 'America/New_York';
const at = (date: string, hhmm: string, tz = LA) => zonedToUtc(date, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), tz);
const CA = workRulesOf(LABOR_US_CA);
const FED = workRulesOf(LABOR_US_FEDERAL);
const WEEK = '2026-11-02'; // Monday
const days = (hours: number[]) => hours.map((h, i) => ({ date: `2026-11-0${2 + i}`, hours: h }));

/** A shift with an optional meal break, as punches. */
function shift(date: string, inAt: string, outAt: string, meal?: [string, string], tz = LA, extra: Partial<Punch> = {}): Punch[] {
  const p: Punch[] = [{ at: at(date, inAt, tz), kind: 'in' }];
  if (meal) p.push({ at: at(date, meal[0], tz), kind: 'break_start', breakKind: 'meal' }, { at: at(date, meal[1], tz), kind: 'break_end' });
  p.push({ at: at(date, outAt, tz), kind: 'out', ...extra });
  return p;
}

describe('punch fold', () => {
  it('folds punches into sessions; meal breaks are unpaid, rest breaks are paid', () => {
    const punches = [
      ...shift('2026-11-02', '08:00', '16:30', ['12:00', '12:30']),
      { at: at('2026-11-02', '10:00'), kind: 'break_start' as const, breakKind: 'rest' as const },
      { at: at('2026-11-02', '10:10'), kind: 'break_end' as const },
    ];
    const f = foldPunches(punches, { tz: LA, now: at('2026-11-03', '09:00') });
    expect(f.state).toBe('off');
    expect(f.sessions).toHaveLength(1);
    expect(f.sessions[0]!.workedMinutes).toBe(480);
    expect(f.anomalies).toEqual([]);
    expect(hoursByDate(f.sessions).get('2026-11-02')).toBe(8);
  });

  it('knows the current state and what may come next', () => {
    const p: Punch[] = [{ at: at('2026-11-02', '08:00'), kind: 'in' }, { at: at('2026-11-02', '12:00'), kind: 'break_start', breakKind: 'meal' }];
    const f = foldPunches(p, { tz: LA, now: at('2026-11-02', '12:10') });
    expect(f.state).toBe('on_break');
    expect(f.current?.workedMinutes).toBe(240);
    expect(allowedNext(f.state)).toEqual(['break_end', 'out']);
    expect(allowedNext('off')).toEqual(['in']);
  });

  it('reports anomalies instead of throwing: missing and forgotten clock-outs, stray punches', () => {
    const p: Punch[] = [
      { at: at('2026-11-02', '07:00'), kind: 'out' },
      { at: at('2026-11-02', '08:00'), kind: 'in' },
      { at: at('2026-11-03', '08:00'), kind: 'in' },
    ];
    const f = foldPunches(p, { tz: LA, now: at('2026-11-04', '08:00') });
    expect(f.anomalies.map((a) => a.kind)).toEqual(['out_without_in', 'missing_clock_out', 'forgotten_clock_out']);
    expect(f.sessions[0]).toMatchObject({ missingOut: true, workedMinutes: 0 });
  });

  it('a shift across midnight counts to the day it started; DST fall-back counts the real 9 hours', () => {
    const night = foldPunches([{ at: at('2026-11-02', '22:00'), kind: 'in' }, { at: at('2026-11-03', '06:00'), kind: 'out' }], { tz: LA, now: at('2026-11-04', '00:00') });
    expect(night.sessions[0]).toMatchObject({ date: '2026-11-02', workedMinutes: 480 });
    // 2026-11-01 is the US fall-back day: 22:00 → 06:00 is 9 real hours.
    const fallBack = foldPunches([{ at: at('2026-10-31', '22:00'), kind: 'in' }, { at: at('2026-11-01', '06:00'), kind: 'out' }], { tz: LA, now: at('2026-11-02', '00:00') });
    expect(fallBack.sessions[0]!.workedMinutes).toBe(540);
  });
});

describe('overtime bands (hours only, never pay)', () => {
  it('FLSA: weekly over 40 at 1.5×, no daily threshold', () => {
    const w = overtimeForWeek(WEEK, days([10, 10, 10, 10, 4]), FED.overtime);
    expect([w.total, w.regular, w.overtime, w.doubleTime]).toEqual([44, 40, 4, 0]);
    expect(w.days[4]).toMatchObject({ regular: 0, overtime: 4 });
  });

  it('CA § 510(a): daily over 8 at 1.5×, over 12 at 2×; daily premium is not counted again toward 40', () => {
    const w = overtimeForWeek(WEEK, days([13, 10, 8, 8, 8]), CA.overtime);
    expect(w.days[0]).toMatchObject({ hours: 13, regular: 8, overtime: 4, doubleTime: 1 });
    expect(w.days[1]).toMatchObject({ regular: 8, overtime: 2 });
    // Regular: 8 × 5 = 40, so no weekly overtime on top.
    expect([w.regular, w.overtime, w.doubleTime]).toEqual([40, 6, 1]);
  });

  it('CA: weekly overtime kicks in after 40 regular hours across the week', () => {
    const w = overtimeForWeek(WEEK, days([8, 8, 8, 8, 8, 6]), CA.overtime);
    expect(w.days[5]).toMatchObject({ regular: 0, overtime: 6 });
  });

  it('CA: the 7th consecutive day in the workweek, first 8 h at 1.5× and the rest at 2×', () => {
    const w = overtimeForWeek(WEEK, days([4, 4, 4, 4, 4, 4, 10]), CA.overtime);
    expect(w.days[6]).toMatchObject({ regular: 0, overtime: 8, doubleTime: 2 });
    // Without seventhDay (FLSA), the same week is 34 h: all regular.
    expect(overtimeForWeek(WEEK, days([4, 4, 4, 4, 4, 4, 10]), FED.overtime).overtime).toBe(0);
  });

  it('CO: over 12 h in a day, or over 40 in a week', () => {
    const w = overtimeForWeek(WEEK, days([13]), workRulesOf(LABOR_US_CO).overtime);
    expect(w.days[0]).toMatchObject({ regular: 12, overtime: 1, doubleTime: 0 });
  });

  it('projectOvertime: the premium a new shift adds, with a plain-language fact', () => {
    const p = projectOvertime(days([8, 8, 8, 8, 8]), { date: '2026-11-07', hours: 2 }, FED.overtime);
    expect([p.addedOvertime, p.addedDoubleTime]).toEqual([2, 0]);
    expect(p.detail).toBe('Would reach 42 h this week: 2 h at 1.5×');
    const none = projectOvertime(days([8, 8, 8]), { date: '2026-11-05', hours: 8 }, FED.overtime);
    expect(none.detail).toBe('32 h this week with this shift; no overtime (starts after 40 h a week)');
    expect(workweekStart('2026-11-08')).toBe(WEEK);
  });
});

describe('meal and rest breaks', () => {
  const sess = (punches: Punch[], now = at('2026-11-03', '00:00'), tz = LA) => foldPunches(punches, { tz, now }).sessions[0]!;

  it('CA: a 30-min meal by the end of hour 5 on a shift over 5 h; flags missed, short and late', () => {
    expect(checkBreaks(sess(shift('2026-11-02', '08:00', '16:30', ['12:00', '12:30'])), CA, LA, 0).issues).toEqual([]);
    expect(checkBreaks(sess(shift('2026-11-02', '08:00', '16:00')), CA, LA, 0).issues.map((i) => i.kind)).toEqual(['meal_missed']);
    expect(checkBreaks(sess(shift('2026-11-02', '08:00', '16:30', ['12:00', '12:20'])), CA, LA, 0).issues.map((i) => i.detail)).toEqual(['Meal break was 20 min; at least 30 min owed']);
    expect(checkBreaks(sess(shift('2026-11-02', '08:00', '16:30', ['13:30', '14:00'])), CA, LA, 0).issues.map((i) => i.kind)).toEqual(['meal_late']);
    // 5 h exactly owes no meal ("more than five hours").
    expect(checkBreaks(sess(shift('2026-11-02', '08:00', '13:00')), CA, LA, 0).meals).toEqual([]);
  });

  it('CA: a second meal over 10 h', () => {
    const c = checkBreaks(sess(shift('2026-11-02', '06:00', '17:30', ['10:00', '10:30'])), CA, LA, 0);
    expect(c.issues.map((i) => i.ruleId)).toEqual(['ca-meal-2']);
  });

  it('an open shift shows the meal deadline, and flags it once passed', () => {
    const open = [{ at: at('2026-11-02', '08:00'), kind: 'in' as const }];
    const early = checkBreaks(sess(open, at('2026-11-02', '10:00')), CA, LA, at('2026-11-02', '10:00'));
    expect(early.meals[0]).toMatchObject({ ruleId: 'ca-meal-1', dueBy: at('2026-11-02', '13:00') });
    expect(early.issues).toEqual([]);
    const late = checkBreaks(sess(open, at('2026-11-02', '13:30')), CA, LA, at('2026-11-02', '13:30'));
    expect(late.issues.map((i) => i.detail)).toEqual(['No meal break started by 13:00 (5 h into the shift)']);
  });

  it('WA: the meal starts 2–5 h into the shift', () => {
    const WA = workRulesOf(LABOR_US_WA);
    expect(checkBreaks(sess(shift('2026-11-02', '08:00', '16:30', ['09:00', '09:30'])), WA, LA, 0).issues.map((i) => i.kind)).toEqual(['meal_early']);
  });

  it('NY § 162: the noonday meal falls in 11:00–14:00 on a shift over 6 h spanning it; the evening meal only for long days', () => {
    const NY = workRulesOf(LABOR_US_NY);
    const ok = sess(shift('2026-11-02', '09:00', '17:30', ['12:00', '12:30'], NYC), at('2026-11-03', '00:00', NYC), NYC);
    expect(checkBreaks(ok, NY, NYC, 0).issues).toEqual([]);
    const outside = sess(shift('2026-11-02', '09:00', '17:30', ['14:30', '15:00'], NYC), at('2026-11-03', '00:00', NYC), NYC);
    expect(checkBreaks(outside, NY, NYC, 0).issues.map((i) => i.kind)).toEqual(['meal_outside_window']);
    const long = sess(shift('2026-11-02', '08:00', '20:00', ['12:00', '12:30'], NYC), at('2026-11-03', '00:00', NYC), NYC);
    expect(checkBreaks(long, NY, NYC, 0).issues.map((i) => i.ruleId)).toEqual(['ny-meal-evening']);
    // A 06:00–11:30 shift does not span the noonday window: nothing owed.
    const morning = sess(shift('2026-11-02', '05:00', '11:30', undefined, NYC), at('2026-11-03', '00:00', NYC), NYC);
    expect(checkBreaks(morning, NY, NYC, 0).meals).toEqual([]);
  });

  it('rest breaks: per 4 h or major fraction (CA, CO), or per whole 4 h (WA)', () => {
    const ca = CA.rest[0]!;
    expect([3.4, 3.5, 6, 6.1, 10, 10.1].map((h) => restBreaksOwed(h, ca))).toEqual([0, 1, 1, 2, 2, 3]);
    const co = workRulesOf(LABOR_US_CO).rest[0]!;
    // CDLE INFO #4 table: up to 2 h → 0; >2–6 → 1; >6–10 → 2; >10–14 → 3.
    expect([2, 2.1, 6, 6.1, 10, 10.1, 14].map((h) => restBreaksOwed(h, co))).toEqual([0, 1, 1, 2, 2, 3, 3]);
    const wa = workRulesOf(LABOR_US_WA).rest[0]!;
    expect([3.9, 4, 8].map((h) => restBreaksOwed(h, wa))).toEqual([0, 1, 2]);
  });

  it('a "no" rest-break attestation at clock-out is an issue', () => {
    const s = sess(shift('2026-11-02', '08:00', '16:30', ['12:00', '12:30'], LA, { restBreaksTaken: false }));
    expect(checkBreaks(s, CA, LA, 0).issues.map((i) => i.detail)).toEqual(['Said they did not get their rest breaks; 2 × 10 min owed on a 8 h shift']);
  });
});

describe('timesheet week', () => {
  it('combines sessions, overtime bands, break issues and anomalies for one workweek', () => {
    const punches = [
      ...['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].flatMap((d) => shift(d, '07:00', '17:30', ['11:00', '11:30'])),
      ...shift('2026-11-06', '07:00', '15:00'),
      ...shift('2026-10-30', '07:00', '15:00'), // previous week: ignored
    ];
    const w = timesheetWeek(punches, { tz: LA, now: at('2026-11-09', '09:00'), weekStart: WEEK, rules: CA });
    expect(w.sessions).toHaveLength(5);
    expect([w.bands.total, w.bands.regular, w.bands.overtime]).toEqual([48, 40, 8]);
    expect(w.sessions[4]!.issues.map((i) => i.kind)).toEqual(['meal_missed']);
    expect(w.issueCount).toBe(1);
    expect(w.open).toBe(false);
  });
});

describe('overtime-aware cover ranking', () => {
  const DATE = '2026-11-06';
  const need: CoverNeed = { siteId: 's1', roomId: 'r', date: DATE, interval: localInterval(DATE, 420, 660, LA), credentials: [] };
  const base = (id: string, shifts: CandidateFacts['shifts'] = []): CandidateFacts => ({
    memberId: id, active: true, homeSiteId: 's1', optIn: 'ask', shifts, absences: [], credentials: [], fairness: { coverTaken: 0, holidayCover: 0, shortNotice: 0 },
  });
  // 38 h Mon–Thu (9.5 h × 4) under FLSA: a 4 h Friday cover reaches 42 h.
  const heavy = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((d) => ({ date: d, interval: localInterval(d, 420, 990, LA) }));
  // The heavy worker is fairer on paper (no covers taken); the light one took 2.
  const people = [base('heavy', heavy), { ...base('light'), fairness: { coverTaken: 2, holidayCover: 0, shortNotice: 0 } }];

  it('allow: ranks on fairness alone and labels the overtime band', () => {
    const r = rankCandidates(need, people, { pack: LABOR_US_FEDERAL, overtimePolicy: 'allow' });
    expect(r.map((c) => [c.memberId, c.costBand, c.overtimeHours])).toEqual([
      ['heavy', 'overtime', 2],
      ['light', 'regular', 0],
    ]);
    expect(r[0]!.checks.find((c) => c.id === 'overtime')!.detail).toBe('Would reach 42 h this week: 2 h at 1.5×');
  });

  it('avoid: overtime candidates stay eligible but rank after everyone at regular time', () => {
    const r = rankCandidates(need, people, { pack: LABOR_US_FEDERAL, overtimePolicy: 'avoid' });
    expect(r.map((c) => [c.memberId, c.rank])).toEqual([
      ['light', 1],
      ['heavy', 2],
    ]);
    expect(r[1]!.checks.find((c) => c.id === 'overtime')!.detail).toMatch(/ranked after people at regular time$/);
  });

  it('exclude: overtime is a hard filter with the reason', () => {
    const r = rankCandidates(need, people, { pack: LABOR_US_FEDERAL, overtimePolicy: 'exclude' });
    expect(r.map((c) => [c.memberId, c.eligible, c.excludedBy])).toEqual([
      ['light', true, null],
      ['heavy', false, 'overtime'],
    ]);
  });

  it('CA double time and the 7th day count: a cover on a 12 h day adds 2× hours', () => {
    const DAY = '2026-11-04';
    const n: CoverNeed = { ...need, date: DAY, interval: localInterval(DAY, 1080, 1200, LA) }; // 18:00–20:00
    const long = base('long', [{ date: DAY, interval: localInterval(DAY, 360, 1080, LA) }]); // 12 h already
    const [c] = rankCandidates(n, [long], { pack: LABOR_US_CA });
    expect([c!.overtimeHours, c!.doubleTimeHours]).toEqual([0, 2]);
  });
});
