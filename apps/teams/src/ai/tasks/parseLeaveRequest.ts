import { z } from 'zod';
import { readDates } from '../dateText';
import { asData, DATA_RULE, defineAiTask } from '../task';

export interface ParseInput {
  text: string;
  today: string;
  /** Leave types the member may book, so the model picks a real key. */
  leaveTypes: Array<{ key: string; name: string }>;
}

export const parsedRequestSchema = z.object({
  leaveType: z.string().nullable().describe('One of the listed keys, or null if unclear.'),
  start: z.iso.date().nullable().describe('First day off, YYYY-MM-DD, or null if unclear.'),
  end: z.iso.date().nullable().describe('Last day off (inclusive), YYYY-MM-DD, or null if unclear.'),
  part: z.enum(['full', 'am', 'pm', 'hours']),
  hours: z.number().positive().max(24).nullable(),
  note: z.string().max(300).nullable().describe('A short reason only if the person gave one and it is not health information.'),
  clarifyingQuestion: z.string().max(300).nullable().describe('One short question when something needed is missing or ambiguous; else null.'),
});
export type ParsedRequest = z.infer<typeof parsedRequestSchema>;

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const SICK_WORDS = /\b(sick|ill|unwell|flu|fever|migraine|doctor|dentist|covid|cold|poorly)\b/;

function pickType(text: string, types: ParseInput['leaveTypes']): string | null {
  const t = text.toLowerCase();
  for (const lt of types) {
    if (lt.key !== 'vacation' && lt.key !== 'sick' && (t.includes(lt.key.toLowerCase()) || t.includes(lt.name.toLowerCase()))) return lt.key;
  }
  const has = (k: string) => types.some((x) => x.key === k);
  if (SICK_WORDS.test(t) && has('sick')) return 'sick';
  if (has('vacation')) return 'vacation';
  return types.length === 1 ? types[0]!.key : null;
}

export const parseLeaveRequestTask = defineAiTask<ParseInput, ParsedRequest>({
  name: 'parseLeaveRequest',
  promptVersion: 'p2',
  cache: false,
  system:
    'You turn one sentence from an employee into the fields of a leave request. Use the given ' +
    'today date to resolve relative dates ("tomorrow", "next Friday" = the Friday of next week, ' +
    '"next week" = Monday to Friday of next week). A month and day without a year means the next ' +
    'time that date occurs, unless the person writes in the past tense (then the most recent one). A range that ends in an earlier month crosses into the next year. ' +
    '"N days from <day>" counts N working days (Monday to Friday) starting that day. "Morning" is ' +
    'part "am", "afternoon" is "pm"; "half day" with no morning/afternoon needs a clarifying ' +
    'question. Pick leaveType only from the listed keys: a named type ("jury duty") → that key; ' +
    'illness or a medical appointment → the sick key if listed; anything else, including no type ' +
    'mentioned, → the vacation key. Do not ask about the type when it is not mentioned. Never invent dates: if a date is missing or ambiguous (e.g. 03/04), ' +
    'set it to null and ask one short clarifying question. Never put health details in note. ' +
    DATA_RULE,
  render: ({ text, today, leaveTypes }) =>
    `Today is ${WEEKDAY[new Date(`${today}T00:00:00Z`).getUTCDay()]} ${today}.\n` +
    `Leave type keys: ${leaveTypes.map((t) => `${t.key} (${t.name})`).join(', ')}.\n` +
    asData('untrusted_request', text),
  output: parsedRequestSchema,
  heuristic: ({ text, today, leaveTypes }) => {
    const t = text.toLowerCase();
    const dates = readDates(text, today);
    const hoursMatch = t.match(/\b(\d{1,2}(?:\.\d)?) ?(?:hours?|hrs?|h)\b/);
    let part: ParsedRequest['part'] = 'full';
    let question = dates.question;
    if (hoursMatch) part = 'hours';
    else if (/\bmorning\b|\ba\.m\.|\b(?:today|tomorrow|day|mon|tue|wed|thu|fri)\w* am\b/.test(t)) part = 'am';
    else if (/\b(afternoon|p\.?m\.?)\b/.test(t)) part = 'pm';
    else if (/\bhalf[- ]day\b/.test(t)) question ??= 'Morning or afternoon?';
    if (part !== 'full' && dates.start !== dates.end) question ??= 'A half day or hours can only be on a single day. Which day?';
    const leaveType = pickType(text, leaveTypes);
    if (!leaveType) question ??= `Which type of leave? (${leaveTypes.map((x) => x.name).join(', ')})`;
    return {
      leaveType,
      start: dates.start,
      end: dates.end,
      part,
      hours: hoursMatch ? Number(hoursMatch[1]) : null,
      note: null,
      clarifyingQuestion: question,
    };
  },
});
