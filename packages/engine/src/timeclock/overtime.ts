import { addDays, mondayIndexedDow } from '../solver/dateUtils';
import type { ISODate } from '../solver/types';
import type { RuleOf } from '../coverage/types';

/*
 * Overtime bands (time-clock prompt, Part 1.2). Splits each day of a workweek into regular,
 * overtime and double-time hours from an `overtime_flag` rule. Hours only: this never sees or
 * returns pay. Integer minutes internally so totals add up exactly.
 *
 * Order of application (as in Cal. Lab. Code § 510(a) and the FLSA):
 *   1. daily thresholds (overtime above `dailyHours`, double time above `doubleTimeDailyHours`);
 *   2. the seventh consecutive workday (first `dailyHours` (8) at overtime, the rest double);
 *   3. weekly: regular hours past `weeklyHours` become overtime, latest days first in time order.
 * Hours already paid at a daily premium never count again toward the weekly threshold.
 */

export type OvertimeRule = Pick<RuleOf<'overtime_flag'>, 'dailyHours' | 'weeklyHours' | 'multiplier' | 'doubleTimeDailyHours' | 'doubleTimeMultiplier' | 'seventhDay'>;

export interface DayHours {
  date: ISODate;
  hours: number;
}

export interface DayBands {
  date: ISODate;
  hours: number;
  regular: number;
  overtime: number;
  doubleTime: number;
  /** Why premium applies on this day, in plain words. */
  reasons: string[];
}

export interface WeekBands {
  weekStart: ISODate;
  days: DayBands[];
  total: number;
  regular: number;
  overtime: number;
  doubleTime: number;
  multiplier: number;
  doubleTimeMultiplier: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const toMin = (h: number) => Math.round(h * 60);
const toH = (m: number) => r2(m / 60);

/** Monday of the workweek containing `date` (the engine's workweek convention). */
export function workweekStart(date: ISODate): ISODate {
  return addDays(date, -mondayIndexedDow(date));
}

/** Bands for one workweek. `days` may be sparse and in any order; dates outside the week are ignored. */
export function overtimeForWeek(weekStart: ISODate, days: readonly DayHours[], rule: OvertimeRule | null | undefined): WeekBands {
  const mult = rule?.multiplier ?? 1.5;
  const dtMult = rule?.doubleTimeMultiplier ?? 2;
  const dates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const minutes = dates.map((d) => toMin(days.filter((x) => x.date === d).reduce((h, x) => h + x.hours, 0)));
  const daily = rule?.dailyHours != null ? toMin(rule.dailyHours) : null;
  const dtDaily = rule?.doubleTimeDailyHours != null ? toMin(rule.doubleTimeDailyHours) : null;
  const weekly = rule?.weeklyHours != null ? toMin(rule.weeklyHours) : null;
  const allSeven = minutes.every((m) => m > 0);

  const bands = dates.map((date, i) => {
    const m = minutes[i]!;
    const reasons: string[] = [];
    let reg = m;
    let ot = 0;
    let dt = 0;
    if (rule?.seventhDay && allSeven && i === 6) {
      const cap = daily ?? 480;
      ot = Math.min(m, cap);
      dt = m - ot;
      reg = 0;
      reasons.push(`7th day in a row: first ${toH(cap)} h at ${mult}×${dt ? `, after that ${dtMult}×` : ''}`);
    } else {
      if (dtDaily != null && m > dtDaily) {
        dt = m - dtDaily;
        reasons.push(`over ${toH(dtDaily)} h in a day at ${dtMult}×`);
      }
      const upToDt = m - dt;
      if (daily != null && upToDt > daily) {
        ot = upToDt - daily;
        reasons.push(`over ${toH(daily)} h in a day at ${mult}×`);
      }
      reg = m - dt - ot;
    }
    return { date, m, reg, ot, dt, reasons };
  });

  if (weekly != null) {
    let cum = 0;
    for (const b of bands) {
      const room = Math.max(0, weekly - cum);
      if (b.reg > room) {
        const moved = b.reg - room;
        b.ot += moved;
        b.reg = room;
        b.reasons.push(`past ${toH(weekly)} h in the week at ${mult}×`);
      }
      cum += b.reg;
    }
  }

  const out: DayBands[] = bands.map((b) => ({ date: b.date, hours: toH(b.m), regular: toH(b.reg), overtime: toH(b.ot), doubleTime: toH(b.dt), reasons: b.reasons }));
  const sum = (k: 'm' | 'reg' | 'ot' | 'dt') => toH(bands.reduce((s, b) => s + b[k], 0));
  return { weekStart, days: out, total: sum('m'), regular: sum('reg'), overtime: sum('ot'), doubleTime: sum('dt'), multiplier: mult, doubleTimeMultiplier: dtMult };
}

export interface OvertimeProjection {
  before: WeekBands;
  after: WeekBands;
  /** Premium hours the extra shift adds (overtime, double time). */
  addedOvertime: number;
  addedDoubleTime: number;
  /** Plain fact for explanations, e.g. "Would reach 42 h this week: 2 h at 1.5×". */
  detail: string;
}

/** What one more shift does to a person's week: the premium hours it adds. */
export function projectOvertime(days: readonly DayHours[], extra: DayHours, rule: OvertimeRule | null | undefined): OvertimeProjection {
  const ws = workweekStart(extra.date);
  const before = overtimeForWeek(ws, days, rule);
  const after = overtimeForWeek(ws, [...days, extra], rule);
  const addedOvertime = r2(after.overtime - before.overtime);
  const addedDoubleTime = r2(after.doubleTime - before.doubleTime);
  const parts: string[] = [];
  if (addedOvertime > 0) parts.push(`${addedOvertime} h at ${after.multiplier}×`);
  if (addedDoubleTime > 0) parts.push(`${addedDoubleTime} h at ${after.doubleTimeMultiplier}×`);
  const thresholds = [rule?.weeklyHours != null ? `${rule.weeklyHours} h a week` : null, rule?.dailyHours != null ? `${rule.dailyHours} h a day` : null].filter(Boolean).join(' or ');
  const detail = parts.length
    ? `Would reach ${after.total} h this week: ${parts.join(' and ')}`
    : `${after.total} h this week with this shift; no overtime${thresholds ? ` (starts after ${thresholds})` : ''}`;
  return { before, after, addedOvertime, addedDoubleTime, detail };
}
