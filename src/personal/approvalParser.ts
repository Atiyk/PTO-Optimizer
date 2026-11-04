import type { ISODate } from '@daysoff/engine/solver/types';
import { isoToSerial, mondayIndexedDow } from '@daysoff/engine/solver/dateUtils';
import type { PtoRequest } from './requestLedger';

/**
 * F4 request autopilot: reads a pasted (later: forwarded) manager reply or HR-system
 * notification and proposes a decision, the leave dates and the tracked request they belong
 * to. The result is only a proposal the user confirms; nothing here changes a status.
 *
 * Pure and deterministic: no Date.now(), no DOM, no network, no eval. Input is capped at
 * MAX_APPROVAL_INPUT characters and treated strictly as text (tags are stripped as text and
 * never rendered), so the same function can run server-side behind an inbound-email webhook.
 *
 * Wording sources for HR-system notifications (Nov 2026). Vendors document the actions and
 * statuses rather than publishing their templates, so the parser keys on those words rather
 * than on exact template sentences:
 * - Workday: approvers "Approve", "Send Back" or "Deny" a Request Time Off business process,
 *   and the employee gets a Workday notification of the action; a denial requires a reason.
 *   https://kb.uwm.edu/45632 , https://kb.wisc.edu/chm/152974
 * - BambooHR: requests are approved or denied by the approver, and the employee is emailed.
 *   https://bamboohr.screenstepslive.com/m/58956/l/639575-life-cycle-of-a-time-off-request ,
 *   https://bamboohr.screenstepslive.com/m/53906/l/969392-time-off-email-notifications
 * - Gusto: "Once the request has been approved or declined, you'll receive an email
 *   notification." https://support.gusto.com/article/999877041000000/Manage-your-time-off-for-employees
 * - Rippling: "You will receive an email notification once a decision is made"; its
 *   workflow recipes speak of a request being "denied".
 *   https://helpdesk.tonyrobbins.com/hc/en-us/articles/45979428479763-Time-Off-Requests-in-Rippling ,
 *   https://www.rippling.com/recipes/pto-request-denied-notification
 * - ADP Workforce Now: "Approve request" / "Deny request", status "Pending Approval", and the
 *   manager-side subject "Time Off Request requires your approval" (which must read as
 *   unclear, not approved). https://www.docsie.io/tutorials/adp/approve-time-off/
 */

export const MAX_APPROVAL_INPUT = 20_000;
const MAX_RANGES = 20;
const MAX_RANGE_DAYS = 1096;

export type ApprovalDecision = 'approved' | 'rejected' | 'unclear';
export type ApprovalConfidence = 'high' | 'medium' | 'low';
/**
 * exact/overlap: matchedRequestId is set. no-requests: nothing planned or requested is tracked.
 * no-dates: no leave dates were found. no-overlap: dates found, no planned/requested request
 * overlaps them. ambiguous: two requests overlap equally. already-decided: only a request in
 * another status overlaps (relatedRequestId says which).
 */
export type MatchReason = 'exact' | 'overlap' | 'no-requests' | 'no-dates' | 'no-overlap' | 'ambiguous' | 'already-decided';
export type ApprovalNote =
  | 'truncated' | 'day-month-ambiguous' | 'day-month-from-locale' | 'mixed-decision' | 'pending'
  | 'weekday-mismatch' | 'weak-decision' | 'dates-outside-decision';

export interface ParsedDateRange { start: ISODate; end: ISODate; sourceText: string }

export interface ApprovalParseResult {
  decision: ApprovalDecision;
  dateRanges: ParsedDateRange[];
  matchedRequestId?: string;
  /** A request that overlaps but is not planned/requested (reason already-decided), or one of the tied candidates. */
  relatedRequestId?: string;
  matchReason: MatchReason;
  confidence: ApprovalConfidence;
  /** The exact phrases (clauses from the input) that drove the decision. */
  evidence: string[];
  notes: ApprovalNote[];
}

export type ApprovalRequestLike = Pick<PtoRequest, 'id' | 'start' | 'end' | 'status'>;

export interface ApprovalParseOptions {
  today: ISODate;
  requests: readonly ApprovalRequestLike[];
  /** BCP 47 tag ("en-US", "en-GB", "de-DE"). Resolves 03/04/2026 as m/d or d/m. */
  locale?: string;
}

// ---------------------------------------------------------------- normalisation and lines

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h\d)\b[^<>]{0,200}>/gi, '\n')
    .replace(/<[^<>]{0,500}>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'")
    .replace(/[\u2018\u2019\u2032]/g, "'").replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u00A0\u2007\u202F\t]/g, ' ')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '');
}

interface Line { text: string; quoted: boolean; segment: number; header: boolean }

const FORWARD_MARKER = /^\s*-{2,}\s*(?:forwarded message|original message|forwarded by\b.*?)\s*-*\s*$/i;
const APPLE_FORWARD = /^\s*begin forwarded message:?\s*$/i;
const WROTE = /\bwrote:\s*$/i;
const HEADER = /^\s*(?:from|to|cc|bcc|date|sent|reply-to|importance|received)\s*:/i;
const SUBJECT = /^\s*subject\s*:\s*/i;

function toLines(text: string): Line[] {
  const raw = text.split('\n');
  const lines: Line[] = [];
  let segment = 0;
  let segmentHasContent = false;
  for (let i = 0; i < raw.length; i++) {
    const quoteMatch = /^\s*((?:>\s?)+)/.exec(raw[i]);
    const quoted = quoteMatch !== null;
    const body = quoted ? raw[i].slice(quoteMatch[0].length) : raw[i];
    if (FORWARD_MARKER.test(body) || APPLE_FORWARD.test(body)) {
      segment++; segmentHasContent = false;
      lines.push({ text: '', quoted, segment, header: true });
      continue;
    }
    if (WROTE.test(body) && (/^\s*on\b/i.test(body) || /^\s*on\b/i.test(lines[lines.length - 1]?.text ?? ''))) {
      if (lines.length && /^\s*on\b/i.test(lines[lines.length - 1].text) && !/^\s*on\b/i.test(body)) lines[lines.length - 1].header = true;
      segment++; segmentHasContent = false;
      lines.push({ text: body, quoted, segment, header: true });
      continue;
    }
    if (/^\s*from\s*:/i.test(body) && segmentHasContent) { segment++; segmentHasContent = false; }
    if (HEADER.test(body)) { lines.push({ text: body, quoted, segment, header: true }); continue; }
    const subject = SUBJECT.exec(body);
    const content = subject ? body.slice(subject[0].length) : body;
    if (content.trim()) segmentHasContent = true;
    lines.push({ text: content, quoted, segment, header: false });
  }
  return lines;
}

// ---------------------------------------------------------------- decision signals

const NEG_WORD = "(?:not|never|cannot|can ?not|can't|cant|won't|wont|couldn't|wouldn't|shouldn't|wasn't|isn't|hasn't|haven't|didn't|don't|doesn't|aren't|weren't|unable to|no longer)";
const APPROVE_WORD = "(?:approv(?:e|ed|al|ing)|grant(?:ed|ing)?|accept(?:ed|ing)?|accommodate|allow(?:ed)?|sign(?:ed)? off on)";

const PENDING: RegExp[] = [
  /\b(?:not|n't)\s+(?:\w+\s+)?yet\b(?:\s+(?:been\s+)?approv\w*)?/gi,
  /\bapprov\w*\s+yet\b/gi,
  /\bpending(?:\s+(?:manager\s+|hr\s+)?approval)?\b/gi,
  /\bawaiting(?:\s+(?:your\s+|manager\s+|hr\s+)?approval)?\b/gi,
  /\b(?:requires?|needs?|waiting (?:on|for))\s+(?:your\s+|my\s+|manager\s+|hr\s+|final\s+)?approval\b/gi,
  /\bfor\s+(?:your\s+|my\s+)?(?:review and\s+)?approval\b/gi,
  /\b(?:please|can you|could you|would you|kindly)\s+(?:\w+\s+)?approve\b/gi,
  /\bstill waiting\b/gi,
  /\bsent back\b/gi,
  /\bon hold\b/gi,
  /\bnot sure\b/gi,
  /\b(?:let me|i'll|i will|need to|have to)\s+(?:double[- ])?(?:check|confirm|get back)\b/gi,
  /\bget back to you\b/gi,
  /\bcancell?ed\b/gi,
  /\b(?:has been|was|been)\s+submitted\b/gi,
];
const NEGATED = new RegExp(`\\b${NEG_WORD}(?:\\s+[a-z']+){0,4}?\\s+${APPROVE_WORD}\\b`, 'gi');
const STRONG_NEG: RegExp[] = [
  NEGATED,
  /\b(?:declined|denied|rejected|disapproved|unapproved|refused|turned down)\b/gi,
  /\b(?:i|we)(?:'m|'re|'ve| am| are| have)?\s+(?:to\s+|have to\s+|must\s+|going to\s+|need to\s+|will\s+|'ll\s+)?(?:decline|deny|reject)\b/gi,
  /\b(?:won't|will not|doesn't|does not|isn't going to|is not going to|not going to)\s+work\b/gi,
  /\bnot (?:possible|feasible|an option)\b/gi,
];
const WEAK_NEG: RegExp[] = [
  /\bunfortunately\b/gi,
  /\bsorry\b/gi,
  /\bafraid (?:not|we|i)\b/gi,
  /\bregret\b/gi,
  /\bnot this time\b/gi,
  /\b(?:don't|do not) think (?:that|this|it|we|i)\b/gi,
  /(?:^|\n)\s*no\s*[.,!]/gi,
];
const STRONG_POS: RegExp[] = [
  /\b(?:pre-?)?approved\b/gi,
  /\b(?:i|we)\s+(?:can\s+|will\s+|'ll\s+)?approve\b/gi,
  /\bapprove (?:it|this|that|them)\b/gi,
  /\bgranted\b/gi,
  /\bconfirmed\b/gi,
  /\baccepted\b/gi,
  /\bsigned off\b/gi,
  /\bgreen light\b/gi,
];
const WEAK_POS: RegExp[] = [
  /\bsounds (?:good|great|fine)\b/gi,
  /\b(?:looks|seems) (?:good|fine)\b/gi,
  /\bgo (?:ahead|for it)\b/gi,
  /\benjoy\b/gi,
  /\bhave (?:a |an )?(?:fun|great|good|wonderful|nice|lovely|amazing|relaxing)\b/gi,
  /\ball set\b/gi,
  /\b(?:that's|that is|it's|it is|totally|all|perfectly|that's totally)\s+fine\b/gi,
  /\b(?:that|this|it|those dates|these dates)\s+works?\b/gi,
  /\bworks for (?:me|us)\b/gi,
  /\bfine (?:by|with) me\b/gi,
  /\bno (?:problem|worries)\b/gi,
  /\bof course\b/gi,
  /\bbook it\b/gi,
  /\bsuccessfully completed\b/gi,
  /(?:^|\n)\s*(?:yes|yep|yup|ok|okay|sure|absolutely|definitely)\b/gi,
  /\u{1F44D}/gu,
];

interface Hit { phrase: string; index: number }

function scan(text: string, patterns: RegExp[], mask: { value: string }): Hit[] {
  const hits: Hit[] = [];
  for (const pattern of patterns) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(mask.value)) !== null) {
      if (match[0].length === 0) { pattern.lastIndex++; continue; }
      hits.push({ phrase: match[0], index: match.index });
      mask.value = mask.value.slice(0, match.index) + ' '.repeat(match[0].length) + mask.value.slice(match.index + match[0].length);
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}

interface Signals { pending: Hit[]; strongNeg: Hit[]; weakNeg: Hit[]; strongPos: Hit[]; weakPos: Hit[] }

function signalsOf(text: string): Signals {
  const mask = { value: text.toLowerCase() };
  // Order matters: pending ("please approve", "not yet approved") and negations ("can't
  // approve") are masked out before anything looks for the bare word "approved".
  const pending = scan(text, PENDING, mask);
  const strongNeg = scan(text, STRONG_NEG, mask);
  const weakNeg = scan(text, WEAK_NEG, mask);
  const strongPos = scan(text, STRONG_POS, mask);
  const weakPos = scan(text, WEAK_POS, mask);
  return { pending, strongNeg, weakNeg, strongPos, weakPos };
}

const anySignal = (s: Signals) => s.pending.length + s.strongNeg.length + s.weakNeg.length + s.strongPos.length + s.weakPos.length > 0;

/** The clause around a hit, cut at sentence punctuation or a line break, at most ~120 chars. */
function clauseAround(text: string, hit: Hit): string {
  let start = hit.index;
  while (start > 0 && hit.index - start < 60 && !/[.!?\n]/.test(text[start - 1])) start--;
  let end = hit.index + hit.phrase.length;
  while (end < text.length && end - hit.index < 80 && !/[.!?\n]/.test(text[end])) end++;
  if (end < text.length && /[.!?]/.test(text[end])) end++;
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------- dates

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const MON_NC = MON.replace(/\((?!\?)/g, '(?:');
const WD = '(?:(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues?|wed|thu(?:rs?)?|fri|sat|sun)\\.?,?\\s+)?';
const DAY = '(\\d{1,2})(?:st|nd|rd|th)?';
const YEAR = '(?:,?\\s*((?:19|20)\\d{2}))?';
const CONN = '\\s*(?:[-\u2010-\u2015\u2212]+|\\b(?:to|through|thru|until|till|til)\\b)\\s*';
const NOT_UNIT = '(?!\\s*(?:days?|weeks?|months?|hours?|hrs?|h\\b|am\\b|pm\\b|business|working|pto|people|%))';

const WEEKDAYS: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

// No regex lookbehind anywhere (older Safari cannot even parse it, which would break the
// page): collectAtoms checks the character before each match instead.
const RE_RANGE_MD_BARE = new RegExp(`${WD}${MON}\\s+${DAY}${YEAR}${CONN}${DAY}(?![\\d/.:])(?!\\s*(?:of\\s+)?${MON_NC}\\b)${NOT_UNIT}${YEAR}\\b`, 'gi');
const RE_RANGE_DM_BARE = new RegExp(`${WD}${DAY}${CONN}${DAY}\\s+(?:of\\s+)?${MON}\\b${YEAR}\\b`, 'gi');
const RE_MD = new RegExp(`${WD}${MON}\\s+${DAY}(?![\\d:])\\b${YEAR}\\b`, 'gi');
const RE_DM = new RegExp(`${WD}${DAY}\\s+(?:of\\s+)?${MON}\\b${YEAR}\\b`, 'gi');
const RE_YMD = new RegExp(`${WD}(\\d{4})([-/.])(\\d{1,2})\\3(\\d{1,2})(?![\\d/.:-]*\\d)`, 'gi');
const RE_NUM = new RegExp(`${WD}(\\d{1,2})([/.])(\\d{1,2})(?:\\3(\\d{4}|\\d{2}))?(?![\\d/.:]*\\d|%)`, 'gi');
const RE_CONN_ONLY = new RegExp(`^${CONN}$`, 'i');
const EXCLUDED_CONTEXT = /(?:\b(?:submitted|requested|sent|created|approved|denied|declined|rejected|updated|received|decided|dated|processed|reviewed)\s+on|\bas of|\bon behalf of)[\s,:]*$/i;

type NumOrder = 'mdy' | 'dmy';

interface Atom {
  index: number; end: number;
  kind: 'name' | 'ymd' | 'num';
  m: number; d: number; y?: number;
  /** Raw numeric parts for d/m resolution. */
  a?: number; b?: number;
  weekday?: number;
}

interface RawRange { start: Atom; end: Atom; index: number; endIndex: number; text: string }

function monthNumber(token: string): number { return MONTHS[token.slice(0, 3).toLowerCase()] ?? 0; }
function weekdayIndex(token: string | undefined): number | undefined { return token ? WEEKDAYS[token.slice(0, 3).toLowerCase()] : undefined; }
function yearOf(token: string | undefined): number | undefined {
  if (!token) return undefined;
  const n = Number(token);
  return token.length === 2 ? 2000 + n : n;
}

function collectAtoms(line: string): { atoms: Atom[]; ranges: RawRange[] } {
  const taken: [number, number][] = [];
  const free = (start: number, end: number) => taken.every(([s, e]) => end <= s || start >= e);
  const ranges: RawRange[] = [];
  const atoms: Atom[] = [];

  const each = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    let guard = 0;
    while ((m = re.exec(line)) !== null && guard++ < 400) {
      if (m[0].length === 0) { re.lastIndex++; continue; }
      if (m.index > 0 && /[\w/.:]/.test(line[m.index - 1])) { re.lastIndex = m.index + 1; continue; }
      fn(m);
    }
  };

  each(RE_RANGE_MD_BARE, (m) => {
    const [, wd, mon, d1, y1, d2, y2] = m;
    const month = monthNumber(mon);
    if (!month || Number(d2) < Number(d1) || !free(m.index, m.index + m[0].length)) return;
    const year = yearOf(y2) ?? yearOf(y1);
    ranges.push({
      start: { index: m.index, end: m.index, kind: 'name', m: month, d: Number(d1), y: yearOf(y1) ?? year, weekday: weekdayIndex(wd) },
      end: { index: m.index, end: m.index, kind: 'name', m: month, d: Number(d2), y: year },
      index: m.index, endIndex: m.index + m[0].length, text: m[0],
    });
    taken.push([m.index, m.index + m[0].length]);
  });
  each(RE_RANGE_DM_BARE, (m) => {
    const [, wd, d1, d2, mon, y] = m;
    const month = monthNumber(mon);
    if (!month || Number(d2) < Number(d1) || !free(m.index, m.index + m[0].length)) return;
    ranges.push({
      start: { index: m.index, end: m.index, kind: 'name', m: month, d: Number(d1), y: yearOf(y), weekday: weekdayIndex(wd) },
      end: { index: m.index, end: m.index, kind: 'name', m: month, d: Number(d2), y: yearOf(y) },
      index: m.index, endIndex: m.index + m[0].length, text: m[0],
    });
    taken.push([m.index, m.index + m[0].length]);
  });

  const push = (atom: Atom) => {
    if (!free(atom.index, atom.end)) return;
    atoms.push(atom);
    taken.push([atom.index, atom.end]);
  };
  each(RE_YMD, (m) => push({ index: m.index, end: m.index + m[0].length, kind: 'ymd', y: Number(m[2]), m: Number(m[4]), d: Number(m[5]), weekday: weekdayIndex(m[1]) }));
  each(RE_MD, (m) => push({ index: m.index, end: m.index + m[0].length, kind: 'name', m: monthNumber(m[2]), d: Number(m[3]), y: yearOf(m[4]), weekday: weekdayIndex(m[1]) }));
  each(RE_DM, (m) => push({ index: m.index, end: m.index + m[0].length, kind: 'name', m: monthNumber(m[3]), d: Number(m[2]), y: yearOf(m[4]), weekday: weekdayIndex(m[1]) }));
  each(RE_NUM, (m) => {
    const [, wd, a, sep, b, y] = m;
    // A dotted pair without a year is more often a time or a version than a date; and a
    // two-digit year only counts with slashes ("12/22/26").
    if (sep === '.' && !y) return;
    if (sep === '.' && y.length === 2) return;
    push({ index: m.index, end: m.index + m[0].length, kind: 'num', a: Number(a), b: Number(b), m: 0, d: 0, y: yearOf(y), weekday: weekdayIndex(wd) });
  });
  atoms.sort((x, y) => x.index - y.index);
  return { atoms, ranges };
}

function pad(n: number, width = 2) { return String(n).padStart(width, '0'); }
function isoOf(y: number, m: number, d: number): ISODate | null {
  if (!Number.isInteger(y) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

const MDY_REGIONS = new Set(['US', 'PH', 'FM', 'MH', 'PW', 'AS', 'GU', 'MP', 'PR', 'UM', 'VI', 'BZ']);
const AMBIGUOUS_REGIONS = new Set(['CA']);

function localeOrder(locale: string | undefined): NumOrder | undefined {
  if (!locale) return undefined;
  const parts = locale.replace(/_/g, '-').split('-');
  const language = parts[0].toLowerCase();
  const region = parts.slice(1).find((p) => /^[A-Za-z]{2}$|^\d{3}$/.test(p))?.toUpperCase();
  if (region && MDY_REGIONS.has(region)) return 'mdy';
  if (region && AMBIGUOUS_REGIONS.has(region)) return undefined;
  if (!region && (language === 'en' || language === 'zh' || language === 'ja' || language === 'ko')) return undefined;
  if (['zh', 'ja', 'ko', 'hu', 'lt'].includes(language)) return undefined;
  return /^[a-z]{2,3}$/.test(language) ? 'dmy' : undefined;
}

// ---------------------------------------------------------------- public API

interface ScoredRange extends ParsedDateRange { order: number }

export function parseApprovalMessage(input: string, options: ApprovalParseOptions): ApprovalParseResult {
  const notes = new Set<ApprovalNote>();
  const source = typeof input === 'string' ? input : '';
  if (source.length > MAX_APPROVAL_INPUT) notes.add('truncated');
  const text = normalize(source.slice(0, MAX_APPROVAL_INPUT));
  const today = options.today;
  let lines = toLines(text);
  if (!lines.some((l) => !l.quoted && !l.header && l.text.trim())) lines = lines.map((l) => ({ ...l, quoted: false }));

  // ---- decision: the first (newest) segment that says anything decisive, quoted text excluded
  const segments = [...new Set(lines.map((l) => l.segment))];
  let decisionSegment: number | undefined;
  let decisionText = '';
  let signals: Signals | undefined;
  for (const segment of segments) {
    const body = lines.filter((l) => l.segment === segment && !l.quoted && !l.header).map((l) => l.text).join('\n');
    const s = signalsOf(body);
    if (anySignal(s)) { decisionSegment = segment; decisionText = body; signals = s; break; }
  }

  let decision: ApprovalDecision = 'unclear';
  let evidenceHits: Hit[] = [];
  let weakOnly = false;
  if (signals) {
    const { pending, strongNeg, weakNeg, strongPos, weakPos } = signals;
    if (strongNeg.length && strongPos.length) { notes.add('mixed-decision'); evidenceHits = [...strongNeg, ...strongPos]; }
    else if (strongNeg.length) { decision = 'rejected'; evidenceHits = strongNeg; }
    else if (strongPos.length && pending.length) { notes.add('pending'); evidenceHits = [...pending, ...strongPos]; }
    else if (strongPos.length) { decision = 'approved'; evidenceHits = strongPos; }
    else if (pending.length) { notes.add('pending'); evidenceHits = pending; }
    else if (weakNeg.length && weakPos.length) { notes.add('mixed-decision'); evidenceHits = [...weakNeg, ...weakPos]; }
    else if (weakNeg.length) { decision = 'rejected'; evidenceHits = weakNeg; weakOnly = true; }
    else if (weakPos.length) { decision = 'approved'; evidenceHits = weakPos; weakOnly = true; }
  }
  if (weakOnly) notes.add('weak-decision');
  const evidence = [...new Set(evidenceHits.sort((a, b) => a.index - b.index).map((hit) => clauseAround(decisionText, hit)))].filter(Boolean).slice(0, 4);

  // ---- dates: the deciding segment's own lines first, then everything else
  const tiers: Line[][] = [];
  const contentLines = lines.filter((l) => !l.header);
  if (decisionSegment !== undefined) {
    tiers.push(contentLines.filter((l) => l.segment === decisionSegment && !l.quoted));
    tiers.push(contentLines.filter((l) => !(l.segment === decisionSegment && !l.quoted)).sort((a, b) => Number(a.quoted) - Number(b.quoted)));
  } else {
    tiers.push(contentLines.filter((l) => !l.quoted));
    tiers.push(contentLines.filter((l) => l.quoted));
  }

  let rawRanges: RawRange[] = [];
  for (let t = 0; t < tiers.length && rawRanges.length === 0; t++) {
    for (const line of tiers[t]) {
      const { atoms, ranges } = collectAtoms(line.text);
      const lineRanges = [...ranges];
      for (let i = 0; i < atoms.length; i++) {
        const a = atoms[i];
        const b = atoms[i + 1];
        const between = b ? line.text.slice(a.end, b.index) : '';
        const isBetweenAnd = b && /^\s+and\s+$/i.test(between) && /\bbetween\s+$/i.test(line.text.slice(Math.max(0, a.index - 12), a.index));
        if (b && (RE_CONN_ONLY.test(between) || isBetweenAnd)) {
          lineRanges.push({ start: a, end: b, index: a.index, endIndex: b.end, text: line.text.slice(a.index, b.end) });
          i++;
        } else if (!(a.kind === 'num' && a.y === undefined && a.weekday === undefined)) {
          // A lone "3/4" or "1/2" is a fraction far more often than a date.
          lineRanges.push({ start: a, end: a, index: a.index, endIndex: a.end, text: line.text.slice(a.index, a.end) });
        }
      }
      for (const r of lineRanges) {
        if (EXCLUDED_CONTEXT.test(line.text.slice(Math.max(0, r.index - 40), r.index))) continue;
        rawRanges.push(r);
      }
      if (rawRanges.length >= MAX_RANGES * 2) break;
    }
    if (t > 0 && rawRanges.length) notes.add('dates-outside-decision');
  }

  // ---- numeric day/month order: evidence in the message itself, then the locale, then m/d
  const numeric = rawRanges.flatMap((r) => [r.start, r.end]).filter((a) => a.kind === 'num');
  const saysDmy = numeric.some((a) => a.a! > 12 && a.b! <= 12);
  const saysMdy = numeric.some((a) => a.b! > 12 && a.a! <= 12);
  const fromLocale = localeOrder(options.locale);
  let order: NumOrder = 'mdy';
  let orderKnown = true;
  if (saysDmy !== saysMdy) order = saysDmy ? 'dmy' : 'mdy';
  else if (fromLocale) { order = fromLocale; if (numeric.some((a) => a.a !== a.b && a.a! <= 12 && a.b! <= 12)) notes.add('day-month-from-locale'); }
  else orderKnown = false;
  for (const atom of numeric) {
    const a = atom.a!; const b = atom.b!;
    const atomOrder: NumOrder = a > 12 ? 'dmy' : b > 12 ? 'mdy' : order;
    if (!orderKnown && a !== b && a <= 12 && b <= 12) notes.add('day-month-ambiguous');
    atom.m = atomOrder === 'mdy' ? a : b;
    atom.d = atomOrder === 'mdy' ? b : a;
  }

  // ---- year inference: a missing year means the next occurrence ending on/after today
  const todayYear = Number(today.slice(0, 4));
  const resolved: ScoredRange[] = [];
  const seen = new Set<string>();
  rawRanges.forEach((r, order) => {
    const s = r.start; const e = r.end;
    let sy = s.y; let ey = e.y;
    const startAfterEnd = s.m * 100 + s.d > e.m * 100 + e.d;
    if (sy === undefined && ey !== undefined) sy = startAfterEnd ? ey - 1 : ey;
    if (ey === undefined && sy !== undefined) ey = startAfterEnd ? sy + 1 : sy;
    if (sy === undefined || ey === undefined) {
      let y = todayYear;
      let endIso = isoOf(startAfterEnd ? y + 1 : y, e.m, e.d);
      if (endIso && endIso < today) { y++; endIso = isoOf(startAfterEnd ? y + 1 : y, e.m, e.d); }
      sy = y; ey = startAfterEnd ? y + 1 : y;
    }
    const start = isoOf(sy, s.m, s.d);
    const end = isoOf(ey, e.m, e.d);
    if (!start || !end || end < start || isoToSerial(end) - isoToSerial(start) >= MAX_RANGE_DAYS) return;
    if (s.weekday !== undefined && mondayIndexedDow(start) !== s.weekday) notes.add('weekday-mismatch');
    if (e !== s && e.weekday !== undefined && mondayIndexedDow(end) !== e.weekday) notes.add('weekday-mismatch');
    const key = `${start}|${end}`;
    if (seen.has(key)) return;
    seen.add(key);
    resolved.push({ start, end, sourceText: r.text.replace(/\s+/g, ' ').trim(), order });
  });
  // A single day inside a found range ("Dec 22 - Dec 24 ... starting Dec 22") adds nothing.
  const dateRanges: ParsedDateRange[] = resolved
    .filter((r) => !(r.start === r.end && resolved.some((o) => o !== r && o.start !== o.end && o.start <= r.start && o.end >= r.end)))
    .slice(0, MAX_RANGES)
    .map(({ start, end, sourceText }) => ({ start, end, sourceText }));

  // ---- match to a tracked request
  const overlapDays = (a: { start: string; end: string }, b: { start: string; end: string }) => {
    const s = a.start > b.start ? a.start : b.start;
    const e = a.end < b.end ? a.end : b.end;
    return s <= e ? isoToSerial(e) - isoToSerial(s) + 1 : 0;
  };
  const open = options.requests.filter((r) => r.status === 'planned' || r.status === 'requested');
  let matchReason: MatchReason;
  let matchedRequestId: string | undefined;
  let relatedRequestId: string | undefined;
  if (dateRanges.length === 0) matchReason = open.length ? 'no-dates' : 'no-requests';
  else {
    const scored = open.map((request) => ({
      request,
      exact: dateRanges.some((r) => r.start === request.start && r.end === request.end),
      days: Math.max(...dateRanges.map((r) => overlapDays(r, request))),
    })).filter((s) => s.days > 0)
      .sort((x, y) => Number(y.exact) - Number(x.exact) || y.days - x.days);
    if (scored.length === 0) {
      const decided = options.requests.find((r) => !open.includes(r) && dateRanges.some((d) => overlapDays(d, r) > 0));
      if (decided) { matchReason = 'already-decided'; relatedRequestId = decided.id; }
      else matchReason = open.length ? 'no-overlap' : 'no-requests';
    } else if (scored.length > 1 && scored[0].exact === scored[1].exact && scored[0].days === scored[1].days) {
      matchReason = 'ambiguous'; relatedRequestId = scored[0].request.id;
    } else {
      matchedRequestId = scored[0].request.id;
      matchReason = scored[0].exact ? 'exact' : 'overlap';
    }
  }

  // ---- confidence
  const rank: Record<ApprovalConfidence, number> = { high: 2, medium: 1, low: 0 };
  let confidence: ApprovalConfidence = 'high';
  const cap = (level: ApprovalConfidence) => { if (rank[level] < rank[confidence]) confidence = level; };
  if (decision === 'unclear') cap('low');
  if (weakOnly) cap('medium');
  if (!matchedRequestId) cap('medium');
  if (matchReason === 'overlap') cap('medium');
  if (notes.has('day-month-from-locale')) cap('medium');
  if (notes.has('day-month-ambiguous') || notes.has('weekday-mismatch')) cap('low');

  return {
    decision, dateRanges, matchedRequestId, relatedRequestId, matchReason, confidence, evidence,
    notes: [...notes],
  };
}
