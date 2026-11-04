/**
 * Balance capture (F5): find the vacation / PTO balance in text that came from a payslip or
 * an HR balance screen, usually via on-device OCR. Pure and deterministic: no DOM, no
 * network, no clock (the caller passes `today`). It only PROPOSES candidates; the page shows
 * them and the user taps one to use it. It never sets a balance on its own.
 *
 * How the big payroll / HR systems present the number (what the rules below are shaped by):
 *
 * - Workday "View Time Off Balances" / "Time Off Results by Period": one row per time off
 *   plan with Beginning Year Balance, Accrued Year to Date, Time Off Paid Year to Date,
 *   Beginning Period Balance, Accrued in Period, Time-Off Paid in Period, Carryover Forfeited
 *   in Period, Ending Period Balance (Including Pending Events), and an "as of" date picker.
 *   Cornell job aid "Understanding time off balances":
 *   https://apps.hr.cornell.edu/workdayCommunications/Workday%20Time%20Tracking%20Tutorials/JobAids/understanding_time_off_balances.pdf
 *   UW–Madison "How to view time off balances in Workday":
 *   https://hr.wisc.edu/hr-guides/for-employees/how-to-view-time-off-balances-in-workday/
 * - ADP Workforce Now "My Time Off": the policy name followed by hours, e.g.
 *   "PTO FTNE: 7.00 hours" next to "CA FT Supplemental PSL 22: 80.00 hours" (PSL = paid sick
 *   leave, which is NOT vacation); accrual detail pages carry "Year to Date" and "All" columns.
 *   https://www.docsie.io/tutorials/adp/check-your-pto-balance/
 *   https://otcdc1.adp.com/ezLMHelp/V18_30/WFN/General/StandardUI/en-US/as_help/as/accruals-balance_detail_page.htm
 *   ADP pay statements put "Vac Hrs Avail"-style lines under "Other Benefits and Information"
 *   with "This Period" / "Total to Date" columns.
 * - Gusto: the employee "Time off" page shows each policy's balance in hours; pay stubs (and
 *   partner add-ons such as GoCo's appended page) list PTO balances per policy.
 *   https://support.gusto.com/article/999877041000000/Manage-your-time-off-employees
 *   https://help.goco.io/en/understanding-pto-balances-on-pay-stubs-in-embedded-payroll
 * - BambooHR paystubs: a "Time Off Balances" section, in hours, per category: taken this pay
 *   period, earned year to date, taken year to date, and the remaining balance; the Time Off
 *   tab shows "N hours available" / "N days available" per category.
 *   https://www.bamboohr.com/product-updates/updated-time-off-balances-on-paystubs
 *   https://bamboohr.screenstepslive.com/m/53906/l/587587-view-time-off-balances
 * - Paychex Flex "Time Off": Type, Description, Accrual rate and Balance, the balance in
 *   hours, units or days depending on the policy.
 *   https://myapps.paychex.com/pngHelp_static/helpHtml/time_off.html
 *
 * So: prefer Balance / Available / Remaining / Ending over Accrued / Earned / Used / Taken /
 * Paid / Beginning; never offer sick, bereavement, jury, parental or comp time banks; ignore
 * payslip EARNINGS tables (Rate / Hours / Current / YTD), where a "Vacation" row is hours PAID,
 * not hours left; and read the as-of date from "as of", "period ending" or "pay date".
 */

export type BalanceUnit = 'days' | 'hours';

export interface BalanceCandidate {
  /** The number as read (negative when the balance is borrowed against). */
  value: number;
  unit: BalanceUnit;
  /** False when no unit was printed near the number and it was inferred. */
  unitStated: boolean;
  /** Human label, e.g. "Vacation available". */
  label: string;
  kind: LeaveKind;
  /** ISO date the balance is as of, when the text gives one. */
  asOf?: string;
  /** The (trimmed) line the number came from. */
  sourceLine: string;
  /** 0..1, higher is more likely the vacation balance. Candidates are sorted by it. */
  confidence: number;
}

export type LeaveKind = 'vacation' | 'pto' | 'annual' | 'holiday' | 'personal' | 'floating' | 'generic';

export interface ExtractOptions {
  /** ISO date (YYYY-MM-DD). Used to reject implausible as-of dates and to place yearless dates. */
  today: string;
  /** The page's balance unit, used only when the text gives no unit at all. */
  unit?: BalanceUnit;
}

export type NoCandidateReason = 'empty' | 'no-numbers' | 'only-other-leave' | 'no-balance';

export interface BalanceAnalysis {
  candidates: BalanceCandidate[];
  /** Why the list is empty (undefined when there are candidates). */
  reason?: NoCandidateReason;
}

type Role = 'balance' | 'accrued' | 'used' | 'begin' | 'pending' | 'rate' | 'money' | 'unknown';
type Kind = LeaveKind | 'excluded';

const MAX_CANDIDATES = 6;

// ---------- leave kinds ----------

const KIND_PATTERNS: { kind: Kind; re: RegExp }[] = [
  // Excluded banks first so "paid sick leave" is not read as "paid time off".
  { kind: 'excluded', re: /\b(?:paid\s+)?sick(?:\s*(?:leave|time|hours|hrs|days|pay|bank))?\b|\billness\b|\bmedical\b|\besst\b|\bpsl\b|\bbereavement\b|\bjury\b|\bfmla\b|\b(?:parental|maternity|paternity|military|unpaid|family)\s*leave\b|\bcomp(?:ensatory)?\s*(?:time|hours|hrs|bank)\b|\blieu\b|\btoil\b|\blwop\b|\bvolunteer(?:\s*time)?\b/gi },
  { kind: 'floating', re: /\bfloat(?:ing|er)?\s*(?:holiday|day)s?\b/gi },
  { kind: 'pto', re: /\bp\.?\s?t\.?\s?o\b\.?|\bpaid\s+time\s+off\b|\bpersonal\s+time\s+off\b|\bflex(?:ible)?\s+time\s+off\b|\bfto\b/gi },
  { kind: 'vacation', re: /\bvac(?:ation|atl?on|at[i1l]on|n|\.)?(?=\b|\s|\d|$)|\bvacation\b|\bvacances\b|\burlaub\b/gi },
  { kind: 'annual', re: /\bannual\s*(?:leave|holiday|vacation)?\b|\bholiday\s*(?:entitlement|allowance)\b|\bearned\s+leave\b|\bprivilege\s+leave\b|\bpaid\s+leave\b/gi },
  { kind: 'personal', re: /\bpersonal\s*(?:days?|leave|time|hours|hrs)?\b|\bcasual\s+leave\b/gi },
  { kind: 'holiday', re: /\bholidays?\b/gi },
  { kind: 'generic', re: /\btime\s*off\b|\bleave\b|\ballowance\b/gi },
];

const KIND_LABEL: Record<LeaveKind, string> = {
  vacation: 'Vacation',
  pto: 'PTO',
  annual: 'Annual leave',
  holiday: 'Holiday',
  personal: 'Personal time',
  floating: 'Floating holiday',
  generic: 'Time off',
};

const KIND_BASE: Record<LeaveKind, number> = {
  vacation: 0.45, pto: 0.45, annual: 0.45, holiday: 0.32, personal: 0.25, floating: 0.2, generic: 0.22,
};

interface KindHit { kind: Kind; start: number; end: number }

function findKinds(line: string): KindHit[] {
  const hits: KindHit[] = [];
  for (const { kind, re } of KIND_PATTERNS) {
    re.lastIndex = 0;
    for (let m = re.exec(line); m; m = re.exec(line)) {
      const start = m.index;
      const end = start + m[0].length;
      if (m[0].trim() === '') { re.lastIndex++; continue; }
      // Earlier patterns win where they overlap ("paid sick leave" stays sick, "annual
      // holiday" stays annual rather than also being a bare holiday).
      if (hits.some((h) => start < h.end && end > h.start)) continue;
      hits.push({ kind, start, end });
    }
  }
  hits.sort((a, b) => a.start - b.start);
  // A generic word right after a specific one belongs to it ("Vacation leave", "PTO time off").
  return hits.filter((h, i) => !(h.kind === 'generic' && i > 0 && h.start - hits[i - 1].end <= 2 && hits[i - 1].kind !== 'generic'));
}

// ---------- roles (which column / what the number means) ----------

interface RoleHit { role: Role; word: string; start: number; end: number }

const ROLE_PATTERNS: { role: Role; re: RegExp }[] = [
  { role: 'begin', re: /\b(?:(?:beginning|beg\.?|starting|opening|prior|previous)(?:\s+(?:year|period|yr))?\s+bal(?:ance)?\b\.?|beginning|opening|carry\s*-?\s*over|carried\s+(?:over|forward)|brought\s+forward|b\/f)/gi },
  { role: 'balance', re: /\b(?:(?:ending|closing|current|net)(?:\s+(?:period|year))?\s+bal(?:ance)?\b\.?|available\s+bal(?:ance)?\b|(?:hours|days)\s+(?:available|remaining|left)\b|available\b|avail\b\.?|avl\b\.?|remaining\b|rem\b\.?|left\b|balance\b|bal\b\.?|outstanding\b|closing\b)/gi },
  { role: 'pending', re: /\b(?:pending|scheduled|requested|planned|approved|booked)\b/gi },
  { role: 'accrued', re: /\b(?:accrued|accrual|accruals|accrue|accr\.?|earned|awarded|granted|grant|credited|entitlement|allowance|allocated|accumulated)\b/gi },
  { role: 'used', re: /\b(?:used|taken|paid|deducted|consumed|spent|usage|availed|forfeited|expired|lost)\b/gi },
  { role: 'rate', re: /\b(?:rate|per\s+(?:pay\s+)?period|per\s+hour)\b/gi },
  { role: 'money', re: /\b(?:amount|earnings|gross|current|this\s+period|ytd|year\s+to\s+date|total\s+to\s+date|to\s+date|hours\s+worked)\b/gi },
];

const BALANCE_WORD_LABEL: [RegExp, string][] = [
  [/avail|avl|hours\s+available|days\s+available/i, 'available'],
  [/remain|rem\b|left|outstanding/i, 'remaining'],
  [/ending|closing/i, 'balance'],
];

function findRoles(text: string): RoleHit[] {
  const hits: RoleHit[] = [];
  for (const { role, re } of ROLE_PATTERNS) {
    re.lastIndex = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const start = m.index;
      const end = start + m[0].length;
      if (hits.some((h) => start < h.end && end > h.start)) continue;
      // "Including pending events" (Workday) qualifies the balance before it; "current" is a
      // money column on payslips, but "current balance" is a balance (matched above).
      if (role === 'pending' && /including\s+$/i.test(text.slice(Math.max(0, start - 12), start))) continue;
      hits.push({ role, word: m[0], start, end });
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

function balanceWordLabel(word: string): string {
  for (const [re, label] of BALANCE_WORD_LABEL) if (re.test(word)) return label;
  return 'balance';
}

// ---------- dates ----------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const DATE_RE = new RegExp(
  [
    '\\b(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})\\b', // ISO-ish
    '\\b(\\d{1,2})\\s?[/\\-.]\\s?(\\d{1,2})\\s?[/\\-.]\\s?(\\d{4}|\\d{2})\\b', // numeric M/D/Y or D.M.Y
    `\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?(?:\\s+(\\d{4}))?\\b`, // Oct 31, 2026
    `\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s-]+${MONTH_RE}[\\s,-]*(\\d{4})?\\b`, // 31 Oct 2026
  ].join('|'),
  'gi',
);

interface DateHit { iso: string; start: number; end: number }

const pad = (n: number) => String(n).padStart(2, '0');

function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

function findDates(text: string, today: string, dayFirst: boolean): DateHit[] {
  const out: DateHit[] = [];
  const todayYear = Number(today.slice(0, 4));
  DATE_RE.lastIndex = 0;
  for (let m = DATE_RE.exec(text); m; m = DATE_RE.exec(text)) {
    let iso: string | null = null;
    if (m[1]) iso = validDate(Number(m[1]), Number(m[2]), Number(m[3]));
    else if (m[4]) {
      const a = Number(m[4]);
      const b = Number(m[5]);
      let y = Number(m[6]);
      if (m[6].length === 2) y += 2000;
      const sep = m[0].replace(/\d|\s/g, '')[0];
      // Dotted dates are day-first (European payslips); a first part over 12 must be a day.
      const df = sep === '.' || a > 12 || (dayFirst && b <= 12);
      iso = df ? validDate(y, b, a) : validDate(y, a, b);
    } else if (m[7]) {
      const month = MONTHS[m[7].toLowerCase().slice(0, 3)];
      iso = withYear(month, Number(m[8]), m[9] ? Number(m[9]) : undefined, todayYear, today);
    } else if (m[10]) {
      const month = MONTHS[m[11].toLowerCase().slice(0, 3)];
      iso = withYear(month, Number(m[10]), m[12] ? Number(m[12]) : undefined, todayYear, today);
    }
    if (iso) out.push({ iso, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function withYear(month: number, day: number, year: number | undefined, todayYear: number, today: string): string | null {
  if (year) return validDate(year, month, day);
  const iso = validDate(todayYear, month, day);
  // A yearless "Oct 31" means the most recent one, not one far in the future.
  if (iso && iso > addDaysISO(today, 31)) return validDate(todayYear - 1, month, day);
  return iso;
}

/** Day-first if any numeric date in the text can only be read day-first (e.g. 31/10/2026). */
function detectDayFirst(text: string): boolean {
  const re = /\b(\d{1,2})\s?[/-]\s?(\d{1,2})\s?[/-]\s?(?:\d{4}|\d{2})\b/g;
  let dayFirst = false;
  let monthFirst = false;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (Number(m[1]) > 12) dayFirst = true;
    if (Number(m[2]) > 12) monthFirst = true;
  }
  return dayFirst && !monthFirst;
}

function plausibleAsOf(iso: string, today: string): boolean {
  return iso <= addDaysISO(today, 31) && iso >= addDaysISO(today, -3 * 366);
}

/** Priority 1 "as of", 2 period end, 3 pay date. Lower wins; ties keep the first. */
function documentAsOf(text: string, today: string, dayFirst: boolean): string | undefined {
  let best: { iso: string; p: number } | undefined;
  const dates = findDates(text, today, dayFirst);
  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    if (!plausibleAsOf(d.iso, today)) continue;
    const before = text.slice(Math.max(0, d.start - 40), d.start).toLowerCase();
    const near = before.slice(-28);
    let p = 9;
    if (/\b(?:as\s*(?:of|at)|balances?\s+(?:date|on)|through|thru|effective)\s*[:\-]?\s*$/.test(near)) p = 1;
    else if (/(?:period\s*(?:end(?:ing)?|end\s*date|to)|end\s*date|ending|to)\s*[:\-]?\s*$/.test(near)) p = 2;
    else if (/[-–]\s*$/.test(near) && i > 0 && dates[i - 1].end >= d.start - 6 && /period|pay|dates?/.test(before)) p = 2;
    else if (/(?:pay\s*(?:date|day)|check\s*date|advice\s*date|payment\s*date|deposit\s*date|date\s*paid|paid\s*on)\s*[:\-]?\s*$/.test(near)) p = 3;
    if (p < 9 && (!best || p < best.p)) best = { iso: d.iso, p };
  }
  return best?.iso;
}

// ---------- numbers ----------

interface NumHit { value: number; unit?: BalanceUnit; start: number; end: number }

const UNIT_HOURS = /^(?:hours?|hrs?|hr?s?\.?|h)$/i;
const UNIT_DAYS = /^(?:days?|dys?|d)$/i;

/** Parse "12.50", "12,5", "1,234.50", "1.234,50", "(3.50)", "3.50-", "−2". */
export function parseAmount(raw: string): number | null {
  let s = raw.trim().replace(/[−–]/g, '-');
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { negative = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { negative = !negative; s = s.slice(1); }
  if (!/^\d[\d.,]*$/.test(s)) return null;
  if (/[.,]$/.test(s)) s = s.slice(0, -1);
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot >= 0 && lastComma >= 0) {
    // Whichever comes last is the decimal mark.
    s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const decimals = s.length - lastComma - 1;
    const commas = (s.match(/,/g) ?? []).length;
    // "12,5" / "12,50" are decimal commas; "1,234" is a thousands separator.
    s = commas === 1 && decimals !== 3 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if ((s.match(/\./g) ?? []).length > 1) {
    return null;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Typical OCR slips inside numbers: O for 0, l/I/| for 1, "12. 50" for 12.50. */
function cleanOcrNumbers(line: string): string {
  return line
    .replace(/(?<=\d)[oO](?=[\d.,\s]|$)|(?<=[\s:(]|^)[oO](?=[.,]\d)/g, '0')
    .replace(/(?<=\d)[lI|](?=\d|[.,]\d)|(?<=[\s:(]|^)[lI|](?=\d)/g, '1')
    .replace(/(\d)\s?\.\s(\d{1,2})\b/g, '$1.$2')
    .replace(/(\d)\s\.\s?(\d{1,2})\b/g, '$1.$2');
}

const NUM_RE = /(?<![\w$£€₹¥.,:/])(\(?[-−–]?\d[\d.,]*\)?-?)(?:\s?(hours?|hrs?\.?|hr|h|days?|dys?|d))?(?![\w%:/]|[.,]\d)/gi;

function findNumbers(text: string): NumHit[] {
  const out: NumHit[] = [];
  NUM_RE.lastIndex = 0;
  for (let m = NUM_RE.exec(text); m; m = NUM_RE.exec(text)) {
    const before = text.slice(Math.max(0, m.index - 2), m.index);
    if (/[$£€₹¥]\s?$/.test(before)) continue;
    let raw = m[1];
    // A trailing "-" is accounting negative only when glued to the number.
    if (raw.endsWith('-') && raw.startsWith('(')) raw = raw.slice(0, -1);
    const value = parseAmount(raw);
    if (value === null) continue;
    // Years in labels ("2026 vacation") and ids are not balances.
    if (/^\d{4}$/.test(raw) && value >= 1900 && value <= 2100) continue;
    if (/^\d{5,}$/.test(raw)) continue;
    const unitWord = m[2];
    const unit = unitWord ? (UNIT_DAYS.test(unitWord.replace(/\.$/, '')) ? 'days' : UNIT_HOURS.test(unitWord.replace(/\.$/, '')) ? 'hours' : undefined) : undefined;
    out.push({ value, unit, start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function unitHint(text: string): BalanceUnit | undefined {
  const hours = /\b(?:hours?|hrs?\.?)\b|\(h\)/i.test(text);
  const days = /\bdays?\b|\(d\)/i.test(text);
  if (hours && !days) return 'hours';
  if (days && !hours) return 'days';
  return undefined;
}

// ---------- the extractor ----------

interface Raw {
  value: number;
  unit?: BalanceUnit;
  unitStated: boolean;
  kind: LeaveKind;
  role: Role;
  roleWord?: string;
  positional: 'exact' | 'guess' | 'none';
  asOf?: string;
  sourceLine: string;
  order: number;
}

interface Header { roles: { role: Role; word: string }[]; unit?: BalanceUnit; rowsLeft: number }

/** Remove dates (recording them) so their digits are not read as amounts. */
function stripDates(line: string, today: string, dayFirst: boolean): { text: string; dates: DateHit[]; asOf?: string } {
  const dates = findDates(line, today, dayFirst);
  let text = line;
  for (const d of [...dates].reverse()) text = text.slice(0, d.start) + ' '.repeat(d.end - d.start) + text.slice(d.end);
  let asOf: string | undefined;
  for (const d of dates) {
    const near = line.slice(Math.max(0, d.start - 16), d.start).toLowerCase();
    if (/\b(?:as\s*(?:of|at)|on|through|thru)\s*[:\-]?\s*$/.test(near) && plausibleAsOf(d.iso, today)) asOf = d.iso;
  }
  return { text, dates, asOf };
}

function parseHeader(text: string): Header | null {
  if (findNumbers(text).length > 0) return null;
  const roles = findRoles(text);
  const columns = roles;
  if (columns.length < 2) return null;
  // Merge modifiers into the column before them when adjacent: "Accrued YTD", "Used this period".
  const merged: { role: Role; word: string }[] = [];
  for (let i = 0; i < columns.length; i++) {
    const r = columns[i];
    const prev = merged[merged.length - 1];
    const gap = i > 0 ? text.slice(columns[i - 1].end, r.start) : '';
    const modifier = /^(?:ytd|year\s+to\s+date|to\s+date|this\s+period)$/i.test(r.word);
    if (prev && modifier && /^\s{0,1}$/.test(gap) && prev.role !== 'money') continue;
    merged.push({ role: r.role, word: r.word });
  }
  if (merged.length < 2) return null;
  return { roles: merged, unit: unitHint(text), rowsLeft: 14 };
}

export function analyzeBalanceText(input: string, options: ExtractOptions): BalanceAnalysis {
  const text = (input ?? '').replace(/\r\n?/g, '\n').replace(/[   ]/g, ' ');
  if (!text.trim()) return { candidates: [], reason: 'empty' };
  const today = options.today;
  const dayFirst = detectDayFirst(text);
  const docAsOf = documentAsOf(text, today, dayFirst);
  const docUnit = unitHint(text);

  const raws: Raw[] = [];
  let sawNumber = false;
  let sawExcluded = false;
  let header: Header | null = null;
  let pendingKind: { kind: Kind; ttl: number } | null = null;
  let pendingRole: { role: Role; word: string; ttl: number } | null = null;
  let order = 0;

  const lines = text.split('\n');
  for (const original of lines) {
    const sourceLine = original.trim().replace(/\s+/g, ' ');
    // OCR puts blank lines between table rows, so a blank line does not end a table.
    if (!sourceLine) continue;
    const cleaned = cleanOcrNumbers(original.replace(/\t/g, '  ').replace(/(?<!\d):|:(?!\d)/g, ' : ').replace(/[|¦]/g, '  '));
    const { text: line, asOf: lineAsOf } = stripDates(cleaned, today, dayFirst);
    const numbers = findNumbers(line);
    if (numbers.length) sawNumber = true;

    const kindsHere = findKinds(line);
    const maybeHeader = kindsHere.some((k) => k.kind !== 'generic') ? null : parseHeader(line);
    if (maybeHeader) { header = maybeHeader; pendingKind = null; pendingRole = null; continue; }

    const kinds = kindsHere;
    if (kinds.some((k) => k.kind === 'excluded')) sawExcluded = true;

    if (numbers.length === 0) {
      // A label on its own line ("Vacation" / "Available") applies to the next lines.
      if (kinds.length) pendingKind = { kind: kinds[kinds.length - 1].kind, ttl: 3 };
      const roles = findRoles(line).filter((r) => r.role !== 'money');
      // Only a short label line ("Available", "Balance remaining") carries its role down.
      if (roles.length && line.trim().split(/\s+/).length <= 3) pendingRole = { role: roles[roles.length - 1].role, word: roles[roles.length - 1].word, ttl: 2 };
      // A sentence or a new section title ends the table above it.
      if (header && (--header.rowsLeft <= 0 || (kinds.length === 0 && line.trim().split(/\s+/).length >= 3))) header = null;
      continue;
    }

    // Split the line into segments, one per leave-type word ("Vacation 40.00  Sick 16.00").
    type Segment = { kind: Kind; text: string; offset: number };
    const segments: Segment[] = [];
    if (kinds.length === 0) {
      const inherited = pendingKind?.kind;
      if (inherited) segments.push({ kind: inherited, text: line, offset: 0 });
      else segments.push({ kind: 'generic', text: line, offset: 0 });
    } else {
      // Numbers before the first leave word belong to it ("12.5 days of vacation left").
      kinds.forEach((k, i) => {
        const start = i === 0 ? 0 : k.start;
        const end = i + 1 < kinds.length ? kinds[i + 1].start : line.length;
        segments.push({ kind: k.kind, text: line.slice(start, end), offset: start });
      });
    }
    const usedKindLine = kinds.length > 0 || Boolean(pendingKind);

    for (const seg of segments) {
      const segNumbers = findNumbers(seg.text);
      if (segNumbers.length === 0) continue;
      if (seg.kind === 'excluded') continue;
      const kind = seg.kind as LeaveKind;
      // Mask the leave-type words so "Paid time off" is not read as a "paid" (used) column.
      let masked = seg.text;
      for (const k of kinds) {
        const s0 = k.start - seg.offset;
        const e0 = k.end - seg.offset;
        if (e0 <= 0 || s0 >= masked.length) continue;
        const a = Math.max(0, s0);
        const b = Math.min(masked.length, e0);
        masked = masked.slice(0, a) + ' '.repeat(b - a) + masked.slice(b);
      }
      const roles = findRoles(masked);
      const segUnit = unitHint(seg.text.replace(/\d[\d.,]*\s?(?:hours?|hrs?\.?|days?)\b/gi, ' '));

      const firstNumStart = segNumbers[0].start;
      const prefixStyle = roles.some((r) => r.end <= firstNumStart);
      const rowUsesHeader = header && roles.filter((r) => r.role !== 'money').length === 0;

      segNumbers.forEach((n, idx) => {
        let role: Role = 'unknown';
        let roleWord: string | undefined;
        let positional: Raw['positional'] = 'none';
        if (rowUsesHeader && header) {
          const cols = header.roles;
          let col: { role: Role; word: string } | undefined;
          if (segNumbers.length === cols.length) { col = cols[idx]; positional = 'exact'; }
          else if (cols.length > segNumbers.length) {
            // Missing cells are usually blank earlier columns; the balance is usually last.
            const balanceLast = cols[cols.length - 1].role === 'balance';
            col = balanceLast ? cols[cols.length - segNumbers.length + idx] : cols[idx];
            positional = 'guess';
          } else {
            col = cols[Math.min(idx, cols.length - 1)];
            positional = 'guess';
          }
          role = col?.role ?? 'unknown';
          roleWord = col?.word;
        } else if (roles.length) {
          if (prefixStyle) {
            const before = roles.filter((r) => r.end <= n.start);
            const r = before[before.length - 1];
            if (r) { role = r.role; roleWord = r.word; }
          } else {
            const nextNumStart = segNumbers[idx + 1]?.start ?? Infinity;
            const after = roles.find((r) => r.start >= n.start && r.start < nextNumStart);
            if (after) { role = after.role; roleWord = after.word; }
          }
        } else if (pendingRole) {
          role = pendingRole.role;
          roleWord = pendingRole.word;
        }

        // A bare number on a line with no leave word and no role word is noise.
        if (!usedKindLine && role === 'unknown') return;
        // A "current"/"YTD"/"amount" money column is never the balance.
        if (role === 'money' || role === 'rate' || role === 'used' || role === 'pending') return;

        let unit = n.unit;
        let unitStated = Boolean(n.unit);
        if (!unit && segUnit) { unit = segUnit; unitStated = true; }
        if (!unit && header?.unit && rowUsesHeader) { unit = header.unit; unitStated = true; }
        if (!unit && docUnit) { unit = docUnit; unitStated = false; }

        raws.push({
          value: n.value, unit, unitStated, kind, role, roleWord, positional,
          asOf: lineAsOf ?? docAsOf, sourceLine, order: order++,
        });
      });
    }

    if (pendingKind && --pendingKind.ttl <= 0) pendingKind = null;
    if (pendingRole && --pendingRole.ttl <= 0) pendingRole = null;
    if (header && --header.rowsLeft <= 0) header = null;
  }

  const strong = raws.filter((r) => r.role === 'balance' || r.role === 'unknown');
  const pool = strong.length ? strong : raws.filter((r) => r.role === 'accrued' || r.role === 'begin');

  const scored: BalanceCandidate[] = [];
  for (const r of pool) {
    let unit: BalanceUnit;
    if (r.unit) unit = r.unit;
    // No unit anywhere: a balance over 50 is far more likely hours than days.
    else if (Math.abs(r.value) > 50) unit = 'hours';
    else unit = options.unit ?? 'days';
    const limit = unit === 'hours' ? 2000 : 366;
    if (Math.abs(r.value) > limit) continue;

    let confidence = KIND_BASE[r.kind];
    if (r.role === 'balance') confidence += 0.35;
    else if (r.role === 'unknown') confidence += 0.15;
    if (r.unitStated) confidence += 0.1;
    if (r.positional === 'guess') confidence -= 0.1;
    if (r.value < 0) confidence -= 0.05;
    if (r.asOf) confidence += 0.05;
    confidence = Math.max(0.05, Math.min(1, Math.round(confidence * 100) / 100));

    const roleLabel = r.role === 'balance'
      ? balanceWordLabel(r.roleWord ?? 'balance')
      : r.role === 'accrued' ? 'accrued' : r.role === 'begin' ? 'starting balance' : '';
    const label = roleLabel ? `${KIND_LABEL[r.kind]} ${roleLabel}` : KIND_LABEL[r.kind];
    scored.push({
      value: r.value, unit, unitStated: r.unitStated, label, kind: r.kind,
      ...(r.asOf ? { asOf: r.asOf } : {}), sourceLine: r.sourceLine, confidence,
    });
  }

  // Same number, unit and leave type read twice (e.g. "This period" and "To date"): keep one.
  const best = new Map<string, BalanceCandidate & { i: number }>();
  scored.forEach((c, i) => {
    const key = `${c.kind}|${c.unit}|${c.value}`;
    const prev = best.get(key);
    if (!prev || c.confidence > prev.confidence) best.set(key, { ...c, i: prev ? prev.i : i });
  });
  const candidates = [...best.values()]
    .sort((a, b) => b.confidence - a.confidence || a.i - b.i)
    .slice(0, MAX_CANDIDATES)
    .map(({ i: _i, ...c }) => c);

  if (candidates.length) return { candidates };
  if (!sawNumber) return { candidates: [], reason: 'no-numbers' };
  if (sawExcluded) return { candidates: [], reason: 'only-other-leave' };
  return { candidates: [], reason: 'no-balance' };
}

/** Ranked vacation / PTO balance candidates found in payslip or HR-screen text. */
export function extractBalanceCandidates(text: string, options: ExtractOptions): BalanceCandidate[] {
  return analyzeBalanceText(text, options).candidates;
}
