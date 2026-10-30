/**
 * Deterministic English date-phrase reader used by the leave-request parser's mock / fallback
 * path. It handles the phrasings people actually type ("Dec 22 to Jan 2", "next Friday
 * afternoon", "3 days from Monday") and asks a question rather than guessing when unsure.
 */

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10,
  nov: 11, november: 11, dec: 12, december: 12,
};
const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, monday: 1, mon: 1, tuesday: 2, tue: 2, tues: 2, wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, friday: 5, fri: 5, saturday: 6, sat: 6,
};
const NUMBER_WORDS: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export function addDays(isoDay: string, n: number): string {
  const d = toDate(isoDay);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
const dow = (isoDay: string) => toDate(isoDay).getUTCDay();
function validYmd(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? iso(dt) : null;
}

/** Monday of the week containing the day. */
const mondayOf = (isoDay: string) => addDays(isoDay, -((dow(isoDay) + 6) % 7));

function addWorkingDays(start: string, count: number): string {
  let d = start;
  let left = count - 1;
  while (left > 0) {
    d = addDays(d, 1);
    if (dow(d) !== 0 && dow(d) !== 6) left--;
  }
  return d;
}

export interface DateReading {
  start: string | null;
  end: string | null;
  question: string | null;
}

type Tok = { start: string; end?: string; at: number; len: number; explicitYear: boolean; weekday?: number };

const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
const WD_RE = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|');
const ORD = '(?:st|nd|rd|th)?';

/** Year for a month/day with no year: the next occurrence, allowing a 30-day look-back. */
function inferYear(today: string, m: number, d: number): number {
  const y = Number(today.slice(0, 4));
  const thisYear = validYmd(y, m, d);
  if (thisYear && thisYear >= addDays(today, -30)) return y;
  return y + 1;
}

function weekdayOccurrence(today: string, target: number, modifier: string | undefined): string {
  const t = dow(today);
  if (modifier === 'next') {
    // "next Friday" = the Friday of next week (Monday-start weeks).
    return addDays(mondayOf(today), 7 + ((target + 6) % 7));
  }
  let diff = (target - t + 7) % 7;
  if (diff === 0 && modifier !== 'this') diff = 7;
  return addDays(today, diff);
}

export function readDates(raw: string, today: string): DateReading {
  const text = ` ${raw.toLowerCase().replace(/[,]/g, ' ').replace(/\s+/g, ' ')} `;
  const toks: Tok[] = [];
  const taken: Array<[number, number]> = [];
  const free = (a: number, len: number) => taken.every(([s, e]) => a + len <= s || a >= e);
  const push = (t: Tok) => {
    if (!free(t.at, t.len)) return;
    toks.push(t);
    taken.push([t.at, t.at + t.len]);
  };

  // ISO dates.
  for (const m of text.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) {
    const v = validYmd(+m[1]!, +m[2]!, +m[3]!);
    if (v) push({ start: v, at: m.index!, len: m[0].length, explicitYear: true });
  }
  // "Dec 22-24", "December 22 – 24 2026"
  for (const m of text.matchAll(new RegExp(`\\b(${MONTH_RE})\\.? (\\d{1,2})${ORD} ?(?:-|–|to|until|through|thru) ?(\\d{1,2})${ORD}\\b(?: (\\d{4}))?`, 'g'))) {
    const mo = MONTHS[m[1]!]!;
    const y = m[4] ? +m[4] : inferYear(today, mo, +m[2]!);
    const a = validYmd(y, mo, +m[2]!);
    const b = validYmd(y, mo, +m[3]!);
    if (a && b) push({ start: a, end: b, at: m.index!, len: m[0].length, explicitYear: !!m[4] });
  }
  // "22-24 Dec", "22nd to 24th of December"
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})${ORD} ?(?:-|–|to|until|through|thru|and|&) ?(\\d{1,2})${ORD} (?:of )?(${MONTH_RE})\\b(?: (\\d{4}))?`, 'g'))) {
    const mo = MONTHS[m[3]!]!;
    const y = m[4] ? +m[4] : inferYear(today, mo, +m[1]!);
    const a = validYmd(y, mo, +m[1]!);
    const b = validYmd(y, mo, +m[2]!);
    if (a && b) push({ start: a, end: b, at: m.index!, len: m[0].length, explicitYear: !!m[4] });
  }
  // "Dec 22", "December 22nd 2026"
  for (const m of text.matchAll(new RegExp(`\\b(${MONTH_RE})\\.? (\\d{1,2})${ORD}\\b(?: (\\d{4}))?`, 'g'))) {
    const mo = MONTHS[m[1]!]!;
    const y = m[3] ? +m[3] : inferYear(today, mo, +m[2]!);
    const v = validYmd(y, mo, +m[2]!);
    if (v) push({ start: v, at: m.index!, len: m[0].length, explicitYear: !!m[3] });
  }
  // "22 Dec", "22nd of December 2026"
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})${ORD} (?:of )?(${MONTH_RE})\\b(?: (\\d{4}))?`, 'g'))) {
    const mo = MONTHS[m[2]!]!;
    const y = m[3] ? +m[3] : inferYear(today, mo, +m[1]!);
    const v = validYmd(y, mo, +m[1]!);
    if (v) push({ start: v, at: m.index!, len: m[0].length, explicitYear: !!m[3] });
  }
  // Numeric d/m or m/d: only when unambiguous.
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g)) {
    const a = +m[1]!;
    const b = +m[2]!;
    if (a <= 12 && b <= 12 && a !== b) {
      return { start: null, end: null, question: `Does "${m[0]}" mean ${monthName(a)} ${b} or ${a} ${monthName(b)}? Please write the month as a word.` };
    }
    const [mo, d] = a > 12 ? [b, a] : [a, b];
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : inferYear(today, mo, d);
    const v = validYmd(y, mo, d);
    if (v) push({ start: v, at: m.index!, len: m[0].length, explicitYear: !!m[3] });
  }
  // Relative words.
  for (const m of text.matchAll(/\b(day after tomorrow|tomorrow|today|tonight)\b/g)) {
    const off = m[1] === 'day after tomorrow' ? 2 : m[1] === 'tomorrow' ? 1 : 0;
    push({ start: addDays(today, off), at: m.index!, len: m[0].length, explicitYear: false });
  }
  for (const m of text.matchAll(/\b(next|this|the) (week|month)\b/g)) {
    if (m[1] === 'the') continue;
    if (m[2] === 'week') {
      const mon = m[1] === 'next' ? addDays(mondayOf(today), 7) : today;
      const fri = addDays(mondayOf(m[1] === 'next' ? addDays(today, 7) : today), 4);
      push({ start: mon, end: fri, at: m.index!, len: m[0].length, explicitYear: false });
    }
  }
  for (const m of text.matchAll(new RegExp(`\\b(?:(next|this|coming) )?(${WD_RE})\\b`, 'g'))) {
    const mod = m[1] === 'coming' ? undefined : m[1];
    push({ start: weekdayOccurrence(today, WEEKDAYS[m[2]!]!, mod), at: m.index!, len: m[0].length, explicitYear: false, weekday: m[1] ? undefined : WEEKDAYS[m[2]!] });
  }

  toks.sort((a, b) => a.at - b.at);

  // "N days" / "a week" duration.
  const dur = text.match(/\b(\d{1,2}|a|one|two|three|four|five|six|seven|eight|nine|ten) (working |work |business )?(days?|weeks?)\b/);
  let durationDays: number | null = null;
  if (dur && !/\bhours?\b/.test(dur[0])) {
    const n = /^\d+$/.test(dur[1]!) ? +dur[1]! : NUMBER_WORDS[dur[1]!]!;
    durationDays = dur[3]!.startsWith('week') ? n * 5 : n;
  }

  if (toks.length === 0) {
    return { start: null, end: null, question: 'Which dates would you like off?' };
  }
  const first = toks[0]!;
  let start = first.start;
  let end = first.end ?? first.start;
  if (toks.length >= 2 && !first.end) {
    const second = toks[1]!;
    end = second.end ?? second.start;
    // "next Friday and Monday", "Friday to Tuesday": a bare weekday after a start means the first one after it.
    if (end < start && second.weekday !== undefined) end = addDays(start, ((second.weekday - dow(start) + 6) % 7) + 1);
    // "Dec 28 to Jan 3": no explicit year and end before start → end is next year.
    if (end < start && !second.explicitYear && second.weekday === undefined) end = `${Number(end.slice(0, 4)) + 1}${end.slice(4)}`;
    // "Friday to Tuesday" across a weekend.
    if (end < start) return { start: null, end: null, question: 'The end date is before the start date. Which dates did you mean?' };
  } else if (durationDays && durationDays > 1 && !first.end) {
    end = addWorkingDays(start, durationDays);
  }
  if (toks.length > 2) {
    return { start, end, question: 'I found more than two dates. Is this one continuous period?' };
  }
  return { start, end, question: null };
}

function monthName(m: number): string {
  return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1]!;
}
