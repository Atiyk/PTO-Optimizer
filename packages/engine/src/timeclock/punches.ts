import type { ISODate } from '../solver/types';
import { localParts } from '../coverage/timeBlocks';

/*
 * Time clock fold (time-clock prompt, Part 1.1). Punches are append-only facts; sessions,
 * state and anomalies are derived here and never stored. Pure and deterministic: `now` is
 * an argument. Anomalies are reported, never thrown, so a messy history still renders.
 */

export type PunchKind = 'in' | 'out' | 'break_start' | 'break_end';
/** Meal breaks are unpaid (deducted); rest breaks are paid (counted as work). */
export type BreakKind = 'meal' | 'rest';

export interface Punch {
  id?: string;
  /** UTC epoch milliseconds. */
  at: number;
  kind: PunchKind;
  breakKind?: BreakKind | null;
  siteId?: string | null;
  /** Rest-break attestation recorded with a clock-out. */
  restBreaksTaken?: boolean | null;
}

export interface BreakSpan {
  start: number;
  end: number | null;
  kind: BreakKind;
}

export interface Session {
  start: number;
  end: number | null;
  /** Local date the session started on (its workday). */
  date: ISODate;
  siteId: string | null;
  breaks: BreakSpan[];
  restBreaksTaken: boolean | null;
  /** Worked minutes up to `end` (or `now` while open), minus unpaid meal breaks. */
  workedMinutes: number;
  /** True when the session was closed by the next clock-in, not a clock-out. */
  missingOut: boolean;
}

export type AnomalyKind = 'out_without_in' | 'break_without_shift' | 'break_end_without_start' | 'missing_clock_out' | 'forgotten_clock_out' | 'open_break_at_out';

export interface Anomaly {
  kind: AnomalyKind;
  at: number;
  detail: string;
}

export type ClockState = 'off' | 'working' | 'on_break';

export interface FoldResult {
  sessions: Session[];
  state: ClockState;
  /** The open session, if clocked in. */
  current: Session | null;
  anomalies: Anomaly[];
}

export interface FoldOptions {
  tz: string;
  now: number;
  /** An open session longer than this is a forgotten clock-out (default 16 h). */
  maxOpenHours?: number;
}

const MIN = 60_000;

function worked(s: Omit<Session, 'workedMinutes'>, until: number): number {
  const end = s.end ?? until;
  let meal = 0;
  for (const b of s.breaks) if (b.kind === 'meal') meal += Math.max(0, Math.min(b.end ?? end, end) - b.start);
  return Math.max(0, Math.round((end - s.start - meal) / MIN));
}

/** Fold punches (any order) into sessions, the current state and anomalies. */
export function foldPunches(punches: readonly Punch[], opts: FoldOptions): FoldResult {
  const sorted = [...punches].sort((a, b) => a.at - b.at || order(a.kind) - order(b.kind));
  const sessions: Omit<Session, 'workedMinutes'>[] = [];
  const anomalies: Anomaly[] = [];
  let cur: Omit<Session, 'workedMinutes'> | null = null;
  let brk: BreakSpan | null = null;

  for (const p of sorted) {
    if (p.kind === 'in') {
      if (cur) {
        anomalies.push({ kind: 'missing_clock_out', at: cur.start, detail: 'Clocked in again without clocking out; the earlier shift has no end' });
        cur.missingOut = true;
        if (brk) brk.end = null;
      }
      cur = { start: p.at, end: null, date: localParts(p.at, opts.tz).date, siteId: p.siteId ?? null, breaks: [], restBreaksTaken: null, missingOut: false };
      brk = null;
      sessions.push(cur);
    } else if (p.kind === 'out') {
      if (!cur) {
        anomalies.push({ kind: 'out_without_in', at: p.at, detail: 'Clocked out without clocking in' });
        continue;
      }
      if (brk) {
        anomalies.push({ kind: 'open_break_at_out', at: p.at, detail: 'Clocked out during a break; the break ends at clock-out' });
        brk.end = p.at;
        brk = null;
      }
      cur.end = p.at;
      cur.restBreaksTaken = p.restBreaksTaken ?? null;
      cur = null;
    } else if (p.kind === 'break_start') {
      if (!cur) {
        anomalies.push({ kind: 'break_without_shift', at: p.at, detail: 'Started a break while clocked out' });
        continue;
      }
      if (brk) brk.end = p.at;
      brk = { start: p.at, end: null, kind: p.breakKind ?? 'meal' };
      cur.breaks.push(brk);
    } else {
      if (!brk) {
        anomalies.push({ kind: 'break_end_without_start', at: p.at, detail: 'Ended a break that was not started' });
        continue;
      }
      brk.end = p.at;
      brk = null;
    }
  }

  // A session left open by a later clock-in has no end: count it as zero worked time until fixed.
  const maxOpen = (opts.maxOpenHours ?? 16) * 3_600_000;
  const out: Session[] = sessions.map((s) => ({ ...s, workedMinutes: s.missingOut ? 0 : worked(s, opts.now) }));
  const open = out.find((s) => s.end === null && !s.missingOut) ?? null;
  if (open && opts.now - open.start > maxOpen) {
    anomalies.push({ kind: 'forgotten_clock_out', at: open.start, detail: `Clocked in for more than ${opts.maxOpenHours ?? 16} h without clocking out` });
  }
  const state: ClockState = !open ? 'off' : open.breaks.some((b) => b.end === null) ? 'on_break' : 'working';
  return { sessions: out, state, current: open, anomalies };
}

function order(k: PunchKind): number {
  return k === 'out' ? 0 : k === 'break_end' ? 1 : k === 'in' ? 2 : 3;
}

/** Which punches are allowed next from a state (UI and capability validation). */
export function allowedNext(state: ClockState): PunchKind[] {
  return state === 'off' ? ['in'] : state === 'working' ? ['break_start', 'out'] : ['break_end', 'out'];
}

/** Worked hours per local date (sessions count to the date they started), rounded to minutes. */
export function hoursByDate(sessions: readonly Session[]): Map<ISODate, number> {
  const m = new Map<ISODate, number>();
  for (const s of sessions) m.set(s.date, (m.get(s.date) ?? 0) + s.workedMinutes);
  for (const [d, mins] of m) m.set(d, Math.round((mins / 60) * 100) / 100);
  return m;
}
