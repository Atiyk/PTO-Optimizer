import type { ISODate, WorkWeek } from '@daysoff/engine/solver/types';
import { addDays, isoToSerial, mondayIndexedDow, rangeISO } from '@daysoff/engine/solver/dateUtils';
import { isValidISODate } from '../ui/urlState';

export const REQUEST_STORAGE_KEY = 'gapless.personal.requests.v1';
export const REQUEST_CHANGE_EVENT = 'gapless:requests-changed';
export const MAX_REQUESTS = 300;
const MAX_REQUEST_DAYS = 1096;

export const REQUEST_STATUSES = ['planned', 'requested', 'approved', 'rejected', 'canceled', 'completed'] as const;
export type RequestStatus = typeof REQUEST_STATUSES[number];

/** All states can be corrected manually. No transition represents an employer action. */
const correctionsFrom = (status: RequestStatus) => REQUEST_STATUSES.filter((next) => next !== status);
export const REQUEST_TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  planned: correctionsFrom('planned'), requested: correctionsFrom('requested'), approved: correctionsFrom('approved'),
  rejected: correctionsFrom('rejected'), canceled: correctionsFrom('canceled'), completed: correctionsFrom('completed'),
};

export interface RequestCalendar {
  workWeek: WorkWeek;
  /** Employer-observed days and schedule exceptions, including alternating Fridays. */
  offDays: readonly ISODate[];
  /** Optional Monday–Sunday working duration, in whole minutes. */
  shiftMinutes?: readonly number[];
  /** Inclusive dates for which the caller has loaded the employer holiday calendar. */
  rangeStart?: ISODate;
  rangeEnd?: ISODate;
}

export interface PtoRequest {
  id: string;
  start: ISODate;
  end: ISODate;
  ptoDates: ISODate[];
  ptoDays: number;
  /** When present, actual native hours priced with the request calendar. */
  ptoMinutes?: Readonly<Record<ISODate, number>>;
  partialMinutes?: number;
  status: RequestStatus;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface RequestInput {
  start: ISODate;
  end: ISODate;
  status?: RequestStatus;
  /** A single-day request can take less than the scheduled shift. */
  partialMinutes?: number;
  note?: string;
}

export interface RequestStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function validRequestRange(start: string, end: string): boolean {
  return isValidISODate(start) && isValidISODate(end) && end >= start
    && isoToSerial(end) - isoToSerial(start) < MAX_REQUEST_DAYS;
}

export function calendarCoversRequest(calendar: RequestCalendar, start: ISODate, end: ISODate): boolean {
  if (!validRequestRange(start, end)) return false;
  if (calendar.rangeStart !== undefined && (!isValidISODate(calendar.rangeStart) || start < calendar.rangeStart)) return false;
  if (calendar.rangeEnd !== undefined && (!isValidISODate(calendar.rangeEnd) || end > calendar.rangeEnd)) return false;
  return !(calendar.rangeStart && calendar.rangeEnd && calendar.rangeEnd < calendar.rangeStart);
}

export function requestCalendarCoverageHint(calendar: RequestCalendar): string {
  if (calendar.rangeStart && calendar.rangeEnd) return `This calendar covers ${calendar.rangeStart} through ${calendar.rangeEnd}. Choose request dates within that range.`;
  if (calendar.rangeStart) return `This calendar covers dates on or after ${calendar.rangeStart}.`;
  if (calendar.rangeEnd) return `This calendar covers dates on or before ${calendar.rangeEnd}.`;
  return '';
}

/** Keep a new draft inside the known calendar even when tomorrow falls outside it. */
export function initialRequestDate(today: ISODate, calendar: RequestCalendar): ISODate {
  let date = addDays(today, 1);
  if (calendar.rangeStart && isValidISODate(calendar.rangeStart) && date < calendar.rangeStart) date = calendar.rangeStart;
  if (calendar.rangeEnd && isValidISODate(calendar.rangeEnd) && date > calendar.rangeEnd) date = calendar.rangeEnd;
  return date;
}

export function requestPtoDates(start: ISODate, end: ISODate, calendar: RequestCalendar): ISODate[] {
  if (!calendarCoversRequest(calendar, start, end)) return [];
  const off = new Set(calendar.offDays);
  return rangeISO(start, end).filter((date) => calendar.workWeek[mondayIndexedDow(date)] && !off.has(date));
}

const validMinutes = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 1440;

export function validShiftMinutes(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === 7 && value.every(minutes => minutes === 0 || validMinutes(minutes));
}

/** A workday without known shift length cannot be priced as an hourly request. */
export function requestPtoMinutes(
  start: ISODate, end: ISODate, calendar: RequestCalendar, partialMinutes?: number,
): Record<ISODate, number> | null {
  if (!validShiftMinutes(calendar.shiftMinutes) || !calendarCoversRequest(calendar, start, end)) return null;
  const dates = requestPtoDates(start, end, calendar);
  if (partialMinutes !== undefined && (start !== end || dates.length !== 1 || !validMinutes(partialMinutes))) return null;
  const durations: Record<ISODate, number> = {};
  for (const date of dates) {
    const shift = calendar.shiftMinutes[mondayIndexedDow(date)];
    if (!validMinutes(shift) || (partialMinutes !== undefined && partialMinutes > shift)) return null;
    durations[date] = partialMinutes ?? shift;
  }
  return durations;
}

export function createPtoRequest(input: RequestInput, calendar: RequestCalendar, id: string, now = new Date().toISOString()): PtoRequest | null {
  if (!calendarCoversRequest(calendar, input.start, input.end) || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) return null;
  const ptoDates = requestPtoDates(input.start, input.end, calendar);
  const ptoMinutes = requestPtoMinutes(input.start, input.end, calendar, input.partialMinutes);
  if ((calendar.shiftMinutes !== undefined || input.partialMinutes !== undefined) && !ptoMinutes) return null;
  const status = input.status ?? 'planned';
  if (!REQUEST_STATUSES.includes(status)) return null;
  return {
    id, start: input.start, end: input.end, ptoDates, ptoDays: ptoDates.length,
    ...(ptoMinutes ? { ptoMinutes } : {}),
    ...(input.partialMinutes !== undefined ? { partialMinutes: input.partialMinutes } : {}),
    status, note: (input.note ?? '').slice(0, 1000), createdAt: now, updatedAt: now,
  };
}

export function parseRequestLedger(raw: string | null): PtoRequest[] {
  if (!raw || raw.length > 1_000_000) return [];
  try {
    const envelope: unknown = JSON.parse(raw);
    if (!envelope || typeof envelope !== 'object' || !('version' in envelope) || envelope.version !== 1
      || !('requests' in envelope) || !Array.isArray(envelope.requests)) return [];
    const seen = new Set<string>();
    const result: PtoRequest[] = [];
    for (const item of envelope.requests.slice(0, MAX_REQUESTS)) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || seen.has(item.id)
        || !/^[A-Za-z0-9_-]{1,100}$/.test(item.id)
        || typeof item.start !== 'string' || typeof item.end !== 'string' || !validRequestRange(item.start, item.end)
        || !REQUEST_STATUSES.includes(item.status) || typeof item.note !== 'string'
        || !Array.isArray(item.ptoDates) || item.ptoDates.length > MAX_REQUEST_DAYS
        || typeof item.createdAt !== 'string' || !Number.isFinite(Date.parse(item.createdAt))
        || typeof item.updatedAt !== 'string' || !Number.isFinite(Date.parse(item.updatedAt))) continue;
      if (!item.ptoDates.every((date: unknown) => typeof date === 'string' && isValidISODate(date) && date >= item.start && date <= item.end)) continue;
      const ptoDates = [...new Set<string>(item.ptoDates)].sort();
      const minutes = item.ptoMinutes;
      if (minutes !== undefined && (!minutes || typeof minutes !== 'object' || Array.isArray(minutes)
        || Object.keys(minutes).length !== ptoDates.length
        || !ptoDates.every(date => Object.hasOwn(minutes, date) && validMinutes(minutes[date])))) continue;
      if (item.partialMinutes !== undefined && (!validMinutes(item.partialMinutes) || item.start !== item.end
        || ptoDates.length !== 1 || minutes?.[item.start] !== item.partialMinutes)) continue;
      result.push({
        id: item.id, start: item.start, end: item.end, status: item.status,
        ptoDates, ptoDays: ptoDates.length, note: item.note.slice(0, 1000),
        ...(minutes === undefined ? {} : { ptoMinutes: Object.fromEntries(ptoDates.map(date => [date, minutes[date]])) }),
        ...(item.partialMinutes === undefined ? {} : { partialMinutes: item.partialMinutes }),
        createdAt: item.createdAt, updatedAt: item.updatedAt,
      });
      seen.add(item.id);
    }
    return result;
  } catch {
    return [];
  }
}

export function browserRequestStorage(): RequestStorage | null {
  try { return typeof window === 'undefined' ? null : window.localStorage; } catch { return null; }
}

export function readRequestLedger(storage: RequestStorage | null = browserRequestStorage()): { requests: PtoRequest[]; available: boolean } {
  if (!storage) return { requests: [], available: false };
  try { return { requests: parseRequestLedger(storage.getItem(REQUEST_STORAGE_KEY)), available: true }; }
  catch { return { requests: [], available: false }; }
}

export function writeRequestLedger(requests: readonly PtoRequest[], storage: RequestStorage | null = browserRequestStorage()): boolean {
  if (!storage) return false;
  try {
    const serialized = JSON.stringify({ version: 1, requests: requests.slice(0, MAX_REQUESTS) });
    if (serialized.length > 1_000_000) return false;
    storage.setItem(REQUEST_STORAGE_KEY, serialized);
    return true;
  } catch { return false; }
}

export function isActiveRequest(request: PtoRequest): boolean {
  return request.status !== 'canceled' && request.status !== 'rejected';
}

export function isScheduledRequest(request: PtoRequest, includeTentative: boolean): boolean {
  return request.status === 'approved' || request.status === 'completed'
    || (includeTentative && (request.status === 'planned' || request.status === 'requested'));
}

/** Dates are unioned before consumption; overlapping entries cannot spend a day twice. */
export function requestDatesForScenario(requests: readonly PtoRequest[], asOf: ISODate, through: ISODate, includeTentative = false): ISODate[] {
  const relevant = requests.filter(request => isScheduledRequest(request, includeTentative));
  return [...new Set(relevant.flatMap((request) => request.ptoDates))]
    .filter((date) => date > asOf && date <= through).sort();
}

/** Tracked approvals constrain new recommendations locally. The days reserved from
 * a gross planning budget use the PTO cost saved with the request, never its full span. */
export function plannerRequestCommitments(requests: readonly PtoRequest[], start: ISODate, end: ISODate, balanceAsOf: ISODate): {
  unavailableDates: ISODate[];
  approvedPtoDays: number;
  hasHourlyBookings: boolean;
} {
  if (!isValidISODate(start) || !isValidISODate(end) || start > end) return { unavailableDates: [], approvedPtoDays: 0, hasHourlyBookings: false };
  const unavailable = new Set<ISODate>();
  const approved = new Set<ISODate>();
  let hasHourlyBookings = false;
  for (const request of requests) {
    if (request.status !== 'approved' && request.status !== 'completed') continue;
    if (!validRequestRange(request.start, request.end)) continue;
    const first = request.start > start ? request.start : start;
    const last = request.end < end ? request.end : end;
    if (first > last) continue;
    for (const date of rangeISO(first, last)) unavailable.add(date);
    if (request.ptoMinutes !== undefined) hasHourlyBookings = true;
    if (request.status === 'approved' && request.ptoMinutes === undefined) {
      for (const date of request.ptoDates) {
        if (date > balanceAsOf && date >= first && date <= last) approved.add(date);
      }
    }
  }
  return { unavailableDates: [...unavailable].sort(), approvedPtoDays: approved.size, hasHourlyBookings };
}

export function requestConflicts(requests: readonly PtoRequest[]): { firstId: string; secondId: string; start: ISODate; end: ISODate }[] {
  const active = requests.filter(isActiveRequest);
  const conflicts: { firstId: string; secondId: string; start: ISODate; end: ISODate }[] = [];
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const start = active[i].start > active[j].start ? active[i].start : active[j].start;
      const end = active[i].end < active[j].end ? active[i].end : active[j].end;
      if (start <= end) conflicts.push({ firstId: active[i].id, secondId: active[j].id, start, end });
    }
  }
  return conflicts;
}
