import { z } from 'zod';
import { readDates } from '../dateText';
import { asData, DATA_RULE, defineAiTask } from '../task';

/*
 * "can't make it in tomorrow" → a call-off draft; "need someone in Toddlers 3:30–4:30 Monday"
 * → a cover-request draft. The model only fills fields; the engine validates them and a
 * person confirms. There is deliberately no field for a reason: a call-off never stores one.
 */
export interface CoverTextInput {
  text: string;
  today: string;
  /** Room names at the person's site, so the model picks a real one. */
  rooms: string[];
  /** Managers may ask for cover; staff only call off. */
  canRequestCover: boolean;
}

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const parsedCoverSchema = z.object({
  intent: z.enum(['call_off', 'cover_request', 'other']).describe('call_off: the writer cannot work. cover_request: a manager asks for someone to cover a time. other: anything else.'),
  day: z.enum(['today', 'tomorrow']).nullable().describe('call_off only: which day they cannot work; null if another day or unclear.'),
  room: z.string().nullable().describe('cover_request: one of the listed rooms, exactly as listed; null if unclear.'),
  date: z.iso.date().nullable().describe('cover_request: YYYY-MM-DD.'),
  start: hhmm.nullable().describe('cover_request: 24-hour HH:MM.'),
  end: hhmm.nullable().describe('cover_request: 24-hour HH:MM.'),
  clarifyingQuestion: z.string().max(300).nullable().describe('One short question when something needed is missing or ambiguous; else null. Never ask why someone is absent.'),
});
export type ParsedCover = z.infer<typeof parsedCoverSchema>;

const ABSENT = /\b(can'?t|cannot|can not|won'?t|will not|unable to|not able to|not going to|not gonna|gonna miss|have to miss)\b[^.]*\b(come|make it|be in|work|be there|do my shift|cover my shift)\b|\bcall(?:ing)? (?:in |out )?sick\b|\bcalling (?:off|out)\b|\bout sick\b|\bi'?m (?:sick|ill|unwell)\b|\bi am (?:sick|ill|unwell)\b|\bsick today\b|\bsick tomorrow\b|\bcan'?t come in\b|\bnot coming (?:in|today|tomorrow)\b/;
const COVER = /\b(need|find|get|looking for|want)\b[^.]*\b(someone|somebody|cover|coverage|a sub|a floater|an extra|another (?:teacher|person|pair of hands))\b|\bcover (?:for|in) (?!me\b)/;
const TIME = /(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*(?:-|–|—|to|until|till|through)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/;

const pad = (n: number) => String(n).padStart(2, '0');

/** Clock times without am/pm: 7–11 morning, 12 noon, 1–6 afternoon (a centre's day). */
function to24(h: number, m: number, ap: string | undefined, otherAp: string | undefined): string | null {
  const suffix = (ap ?? otherAp)?.replace(/\./g, '');
  let hh = h;
  if (suffix === 'pm' && h < 12) hh += 12;
  else if (suffix === 'am' && h === 12) hh = 0;
  else if (!suffix && h >= 1 && h <= 6) hh += 12;
  if (hh > 23 || m > 59) return null;
  return `${pad(hh)}:${pad(m)}`;
}

export function readTimes(text: string): { start: string; end: string } | null {
  const t = text.toLowerCase().match(TIME);
  if (!t) return null;
  const [, h1, m1, ap1, h2, m2, ap2] = t;
  // "3:30-4:30pm": the end's suffix carries to the start when that keeps start before end.
  const start = to24(Number(h1), Number(m1 ?? 0), ap1, ap2 && Number(h1) <= Number(h2) ? ap2 : undefined);
  const end = to24(Number(h2), Number(m2 ?? 0), ap2, ap1);
  if (!start || !end || start >= end) return null;
  return { start, end };
}

const singular = (s: string) => s.toLowerCase().replace(/s$/, '');

function heuristic({ text, today, rooms, canRequestCover }: CoverTextInput): ParsedCover {
  const l = text.toLowerCase().replace(/[’]/g, "'");
  const none: ParsedCover = { intent: 'other', day: null, room: null, date: null, start: null, end: null, clarifyingQuestion: null };
  const absent = ABSENT.test(l);
  const cover = canRequestCover && COVER.test(l) && !/\bcover (?:for )?me\b|\bmy shift\b/.test(l);
  if (absent && !cover) {
    const tomorrow = /\b(tomorrow|tmrw|tmr|tomoz)\b/.test(l);
    const todayWord = /\b(today|this morning|this afternoon|tonight|right now|now)\b/.test(l);
    const dates = readDates(text, today);
    const other = !tomorrow && !todayWord && dates.start != null && dates.start !== today;
    if (other) return { ...none, intent: 'call_off', clarifyingQuestion: 'A call-off is for today or tomorrow. For another day, ask for time off instead.' };
    return { ...none, intent: 'call_off', day: tomorrow ? 'tomorrow' : 'today' };
  }
  if (cover) {
    const room = rooms.find((r) => new RegExp(`\\b${singular(r).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`).test(l)) ?? null;
    const times = readTimes(l);
    const dates = readDates(text.replace(TIME, ' '), today);
    const date = /\b(today|this afternoon|this morning)\b/.test(l) ? today : dates.start;
    const missing = [!room && 'which room', !date && 'which day', !times && 'what time (for example 3:30 to 4:30)'].filter(Boolean);
    return {
      intent: 'cover_request',
      day: null,
      room,
      date: date ?? null,
      start: times?.start ?? null,
      end: times?.end ?? null,
      clarifyingQuestion: missing.length ? `Cover for ${missing.join(', ')}?` : null,
    };
  }
  return none;
}

export const parseCoverTextTask = defineAiTask<CoverTextInput, ParsedCover>({
  name: 'parseCoverText',
  promptVersion: 'c1',
  cache: false,
  system:
    'You turn a short message from a childcare or clinic workplace into fields. intent "call_off" when ' +
    'the writer says they cannot work (sick, emergency, cannot come in); set day to "today" or ' +
    '"tomorrow" from the message, "today" when no day is given, and null with a clarifying question ' +
    'when they name any other day. intent "cover_request" only when the writer may request cover and ' +
    'asks for someone to cover a room and time; pick room from the list exactly, date as YYYY-MM-DD ' +
    'relative to today, and 24-hour times (in a centre, a bare 1 to 6 means afternoon). Otherwise ' +
    'intent "other". Never ask for or record why someone is absent. ' +
    DATA_RULE,
  render: ({ text, today, rooms, canRequestCover }) =>
    `Today is ${today} (${new Date(`${today}T00:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'long' })}). ` +
    `Rooms: ${JSON.stringify(rooms)}. The writer ${canRequestCover ? 'may' : 'may not'} request cover.\n` +
    asData('untrusted_message', text),
  output: parsedCoverSchema,
  heuristic,
});
