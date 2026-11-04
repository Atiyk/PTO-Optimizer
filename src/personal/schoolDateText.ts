import { isoToSerial } from '@daysoff/engine/solver/dateUtils';
import { isValidISODate } from '../ui/urlState';

/**
 * Deterministic date extraction from pasted school-calendar text or on-device OCR output.
 * No network and no AI: a small set of US calendar formats, read line by line. Results are
 * candidates only; the UI must have the user confirm each one before it is added. Lines that
 * do not parse (OCR noise such as "Dec 2l") are skipped rather than guessed.
 */
export interface ExtractedSchoolDate {
  id: string;
  start: string;
  end: string;
  /** Text snippet (≤ 80 chars) the dates came from, for the confirm step only; never stored. */
  snippet: string;
  /** Closure keyword found on the line (recess, break, holiday, no school, closed, …). */
  label?: string;
  /** 'likely-closure' when a closure keyword is on the line; otherwise 'unsure'. */
  confidence: 'likely-closure' | 'unsure';
}

export const MAX_EXTRACT_INPUT = 50_000;
export const MAX_EXTRACT_RESULTS = 300;
const MAX_RANGE_DAYS = 31;
const SNIPPET_LENGTH = 80;

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_PATTERN = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const ORDINAL = '(?:st|nd|rd|th)?';
/** "Dec 21", "December 21st, 2026", "Sept. 8". The day must end on a word boundary so
 * OCR noise like "Dec 2l" does not match. */
const NAMED = `\\b(${MONTH_PATTERN})\\.?\\s*(\\d{1,2})${ORDINAL}\\b(?:,?\\s*(\\d{4})\\b)?`;
/** "11/26", "11/26/2026", "1/1/27"; not part of a longer slash/number run, and not "1/2 day". */
const NUMERIC = '(?<![\\d/])(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?(?![\\d/])(?!\\s*day\\b)';
const ATOM = new RegExp(`${NAMED}|${NUMERIC}`, 'gi');
/** The end may carry its own weekday: "Monday, December 21 – Friday, January 1". */
const SEPARATOR = /^\s*(?:-|to|through|thru|until)\s*(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s*)?$/i;
/** A second same-month day joined by "and"/"&": "No school Nov 26 and 27" is two dates. */
const BARE_AND = /^\s*(?:and|&)\s*(\d{1,2})(?:st|nd|rd|th)?\b(?![/\d])(?:,?\s*(\d{4})\b)?/i;
/** Same-month end day after a dash: "Nov 26-27", "11/26-27", "Nov 26 - 27, 2026". */
const BARE_END = /^\s*(?:-|to|through|thru|until)\s*(\d{1,2})(?:st|nd|rd|th)?\b(?![/\d])(?:,?\s*(\d{4})\b)?/i;

/** Order matters: the first match becomes the label. */
const CLOSURE_KEYWORDS = [
  'no school', 'schools closed', 'school closed', 'no classes', 'no students', 'students do not attend',
  'non-attendance', 'recess', 'break', 'vacation', 'holiday', 'closed', 'day off',
  'professional development', 'staff development', 'teacher workday', 'conference',
];
/** Lines about returning, partial days or the edges of the year are not closures, even if
 * they mention one ("Classes resume after winter break"). */
const NOT_CLOSURE = /\b(?:resume[sd]?|return|early (?:dismissal|release)|half[- ]day|minimum day|first day|last day|back to school|open house)\b/i;

interface Atom {
  index: number;
  end: number;
  month: number;
  day: number;
  year?: number;
}

function fullYear(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const value = Number(raw);
  return raw.length === 2 ? 2000 + value : value;
}

function iso(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function findAtoms(line: string): Atom[] {
  const atoms: Atom[] = [];
  for (const match of line.matchAll(ATOM)) {
    const named = match[1] !== undefined;
    const monthKey = named ? match[1].toLowerCase().slice(0, match[1].toLowerCase().startsWith('sept') ? 4 : 3) : '';
    atoms.push({
      index: match.index!,
      end: match.index! + match[0].length,
      month: named ? MONTHS[monthKey] : Number(match[4]),
      day: Number(named ? match[2] : match[5]),
      year: fullYear(named ? match[3] : match[6]),
    });
  }
  return atoms;
}

function snippetFor(line: string, at: number): string {
  const clean = line.trim().replace(/\s+/g, ' ');
  if (clean.length <= SNIPPET_LENGTH) return clean;
  const offset = Math.max(0, Math.min(clean.length - SNIPPET_LENGTH, at - 20));
  return clean.slice(offset, offset + SNIPPET_LENGTH).trim();
}

function closureLabel(line: string): string | undefined {
  const lower = line.toLowerCase();
  return CLOSURE_KEYWORDS.find(keyword => new RegExp(`\\b${keyword}s?\\b`).test(lower));
}

/** Months Aug-Dec belong to the school year's first calendar year, Jan-Jul to the next. */
function inferYear(month: number, schoolYearStart: number): number {
  return month >= 8 ? schoolYearStart : schoolYearStart + 1;
}

/** Resolve years and validate; null for impossible dates or ranges over 31 days. */
function toRange(first: Atom, last: Atom, schoolYearStart: number): { start: string; end: string } | null {
  const endYear = last.year ?? inferYear(last.month, schoolYearStart);
  // "March 29 - April 2, 2027": a start without a year takes it from the end.
  let startYear = first.year
    ?? (last.year !== undefined ? (first.month <= last.month ? endYear : endYear - 1) : inferYear(first.month, schoolYearStart));
  let start = iso(startYear, first.month, first.day);
  const end = iso(endYear, last.month, last.day);
  if (!isValidISODate(start) || !isValidISODate(end)) return null;
  // Inferred years can straddle the Jul/Aug school-year seam ("Jul 30 - Aug 2").
  if (end < start && first.year === undefined && last.year === undefined) {
    startYear -= 1;
    start = iso(startYear, first.month, first.day);
    if (!isValidISODate(start)) return null;
  }
  if (end < start || isoToSerial(end) - isoToSerial(start) + 1 > MAX_RANGE_DAYS) return null;
  return { start, end };
}

export function extractSchoolDates(text: string, opts: { schoolYearStart: number }): ExtractedSchoolDate[] {
  if (typeof text !== 'string' || !opts || !Number.isInteger(opts.schoolYearStart)
    || opts.schoolYearStart < 1900 || opts.schoolYearStart > 2200) return [];
  const results = new Map<string, ExtractedSchoolDate>();
  const lines = text.slice(0, MAX_EXTRACT_INPUT).replace(/[\u2010-\u2015\u2212]/g, '-').split(/\r?\n|\r/);
  for (const line of lines) {
    if (results.size >= MAX_EXTRACT_RESULTS) break;
    const atoms = findAtoms(line);
    if (!atoms.length) continue;
    const label = closureLabel(line);
    const confidence = label && !NOT_CLOSURE.test(line) ? 'likely-closure' : 'unsure';
    const add = (range: { start: string; end: string } | null, at: number) => {
      if (!range || results.size >= MAX_EXTRACT_RESULTS) return;
      const id = `${range.start}_${range.end}`;
      if (!results.has(id)) results.set(id, { id, ...range, snippet: snippetFor(line, at), ...(label ? { label } : {}), confidence });
    };
    for (let i = 0; i < atoms.length; i++) {
      const first = atoms[i];
      const next = atoms[i + 1];
      if (next && SEPARATOR.test(line.slice(first.end, next.index))) {
        const range = toRange(first, next, opts.schoolYearStart);
        if (range) { add(range, first.index); i++; continue; }
      } else {
        const bare = BARE_END.exec(line.slice(first.end));
        if (bare) {
          const year = fullYear(bare[2]) ?? first.year;
          // A year after the end day ("Nov 26-27, 2026") also dates the start.
          const range = toRange({ ...first, year: first.year ?? year }, { ...first, day: Number(bare[1]), year }, opts.schoolYearStart);
          if (range) { add(range, first.index); continue; }
        }
        const pair = BARE_AND.exec(line.slice(first.end));
        if (pair) {
          const year = fullYear(pair[2]) ?? first.year;
          const one = toRange({ ...first, year }, { ...first, year }, opts.schoolYearStart);
          const two = { ...first, day: Number(pair[1]), year };
          const second = toRange(two, two, opts.schoolYearStart);
          if (one && second) { add(one, first.index); add(second, first.index); continue; }
        }
      }
      // Not a usable range ("January 18 - 3 day weekend"): keep the single date.
      add(toRange(first, first, opts.schoolYearStart), first.index);
    }
  }
  return [...results.values()].sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
}
