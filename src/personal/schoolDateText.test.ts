import { describe, expect, it } from 'vitest';
import { extractSchoolDates, MAX_EXTRACT_RESULTS } from './schoolDateText';

const extract = (text: string) => extractSchoolDates(text, { schoolYearStart: 2026 });
const ranges = (text: string) => extract(text).map(item => [item.start, item.end]);

describe('extractSchoolDates formats', () => {
  it('reads month-name ranges across the new year with inferred years', () => {
    const [item] = extract('Winter Recess .... Dec 21 - Jan 1');
    expect(item).toEqual({
      id: '2026-12-21_2027-01-01', start: '2026-12-21', end: '2027-01-01',
      snippet: 'Winter Recess .... Dec 21 - Jan 1', label: 'recess', confidence: 'likely-closure',
    });
  });

  it('reads full dates with written years and en/em dashes', () => {
    expect(ranges('December 21, 2026 – January 1, 2027')).toEqual([['2026-12-21', '2027-01-01']]);
    expect(ranges('Spring Recess: March 29–April 2, 2027')).toEqual([['2027-03-29', '2027-04-02']]);
    expect(ranges('Break Dec 21 — Jan 1')).toEqual([['2026-12-21', '2027-01-01']]);
  });

  it('reads numeric dates and ranges', () => {
    expect(extract('11/26-11/27 Thanksgiving Recess (schools closed)')[0]).toMatchObject({
      start: '2026-11-26', end: '2026-11-27', label: 'schools closed', confidence: 'likely-closure',
    });
    expect(ranges('12/21–1/1 winter break')).toEqual([['2026-12-21', '2027-01-01']]);
    expect(ranges('11/26/2026 Thanksgiving')).toEqual([['2026-11-26', '2026-11-26']]);
    expect(ranges('Staff day 1/29/27')).toEqual([['2027-01-29', '2027-01-29']]);
    expect(ranges('Recess 11/26-27')).toEqual([['2026-11-26', '2026-11-27']]);
  });

  it('reads weekday-prefixed single dates', () => {
    expect(extract('Monday, January 18 Dr. Martin Luther King Jr. Day — No School')).toEqual([{
      id: '2027-01-18_2027-01-18', start: '2027-01-18', end: '2027-01-18',
      snippet: 'Monday, January 18 Dr. Martin Luther King Jr. Day - No School', label: 'no school', confidence: 'likely-closure',
    }]);
    expect(ranges('Mon, Feb 15 Presidents Day')).toEqual([['2027-02-15', '2027-02-15']]);
    expect(ranges('Thursday, November 26 Thanksgiving holiday')).toEqual([['2026-11-26', '2026-11-26']]);
  });

  it('reads same-month ranges and to/through/thru/until separators', () => {
    expect(ranges('Nov 26-27 Thanksgiving')).toEqual([['2026-11-26', '2026-11-27']]);
    expect(ranges('Nov 25 - 27, 2026 recess')).toEqual([['2026-11-25', '2026-11-27']]);
    expect(ranges('Feb 15 to Feb 19 mid-winter recess')).toEqual([['2027-02-15', '2027-02-19']]);
    expect(ranges('April 19 through April 23 spring break')).toEqual([['2027-04-19', '2027-04-23']]);
    expect(ranges('Dec 21 thru Jan 1')).toEqual([['2026-12-21', '2027-01-01']]);
    expect(ranges('Dec. 21 until Dec. 23')).toEqual([['2026-12-21', '2026-12-23']]);
    expect(ranges('June 14th-18th')).toEqual([['2027-06-14', '2027-06-18']]);
  });

  it('handles Sept and Sept. abbreviations and ordinals', () => {
    expect(ranges('Labor Day Sept 7')).toEqual([['2026-09-07', '2026-09-07']]);
    expect(ranges('Sept. 21st Rosh Hashanah, schools closed')).toEqual([['2026-09-21', '2026-09-21']]);
    expect(ranges('Sep 25 Yom Kippur')).toEqual([['2026-09-25', '2026-09-25']]);
    expect(ranges('September 7, 2026 Labor Day')).toEqual([['2026-09-07', '2026-09-07']]);
  });

  it('reads several dates on one line', () => {
    expect(ranges('Schools closed: Oct 12, Nov 3, Nov 11')).toEqual([
      ['2026-10-12', '2026-10-12'], ['2026-11-03', '2026-11-03'], ['2026-11-11', '2026-11-11'],
    ]);
  });
});

describe('extractSchoolDates on messy text', () => {
  const OCR = `
    NEW YORK CITY PUBLlC SCHOOLS  2026-2027 CALENDAR
    Sept 10 .......... First day of school
    Sep 2l Rosh Hashanah (schools closed)
    Oct I2 Indigenous Peoples' Day
    11/3 Election Day — students do not attend
    11/26-11/27 Thanksgiving Recess (schools closed)
    Winter Recess .... Dec 24 - Jan 1
    Jan 4 Classes resume after winter break
    Monday, January 18 Dr. Martin Luther King Jr. Day — No School
    Feb l5-l9 Midwinter Recess
    Spring Recess: March 29–April 2, 2027
    June 25  Last day of school; early dismissal (1/2 day)
    @@## 99/99 ~~ ||| feb 30 ||
  `;

  it('extracts the parseable lines and skips OCR noise without throwing', () => {
    const result = extract(OCR);
    expect(result.map(item => [item.start, item.end, item.confidence])).toEqual([
      ['2026-09-10', '2026-09-10', 'unsure'],
      ['2026-11-03', '2026-11-03', 'likely-closure'],
      ['2026-11-26', '2026-11-27', 'likely-closure'],
      ['2026-12-24', '2027-01-01', 'likely-closure'],
      ['2027-01-04', '2027-01-04', 'unsure'],
      ['2027-01-18', '2027-01-18', 'likely-closure'],
      ['2027-03-29', '2027-04-02', 'likely-closure'],
      ['2027-06-25', '2027-06-25', 'unsure'],
    ]);
  });

  it('caps snippets at 80 characters around the match', () => {
    const line = `${'x'.repeat(120)} Winter break Dec 21 - Jan 1 ${'y'.repeat(120)}`;
    const [item] = extract(line);
    expect(item.snippet.length).toBeLessThanOrEqual(80);
    expect(item.snippet).toContain('Dec 21 - Jan 1');
  });

  it('marks dates without a closure keyword as unsure and leaves label out', () => {
    const [item] = extract('Report cards Nov 13');
    expect(item.confidence).toBe('unsure');
    expect(item).not.toHaveProperty('label');
  });

  it('does not match words that only contain a month name', () => {
    expect(extract('Mayor 5 visits; Marching band 3; Decimal 12')).toEqual([]);
  });

  it('falls back to a single date when the range part is not a date', () => {
    expect(ranges('January 18 - 3 day weekend')).toEqual([['2027-01-18', '2027-01-18']]);
  });
});

describe('extractSchoolDates rejects and caps', () => {
  it('rejects impossible dates and ranges longer than 31 days', () => {
    expect(extract('Feb 30 holiday; 2/29 break; 13/1 closed; Apr 31')).toEqual([]);
    expect(ranges('Leap 2/29/28')).toEqual([['2028-02-29', '2028-02-29']]);
    // Too long to be one range, so each end is offered on its own for the user to confirm.
    expect(ranges('Summer break June 25 - Sept 8')).toEqual([['2026-09-08', '2026-09-08'], ['2027-06-25', '2027-06-25']]);
    expect(ranges('Dec 1 - Jan 1 break')).toEqual([['2026-12-01', '2026-12-01'], ['2027-01-01', '2027-01-01']]);
  });

  it('handles a range across the Jul/Aug school-year seam', () => {
    expect(ranges('Jul 30 - Aug 2 camp break')).toEqual([['2026-07-30', '2026-08-02']]);
  });

  it('deduplicates, sorts and caps results', () => {
    expect(ranges('Dec 21 - Jan 1\nWinter break 12/21-1/1\nNov 26')).toEqual([
      ['2026-11-26', '2026-11-26'], ['2026-12-21', '2027-01-01'],
    ]);
    const many = Array.from({ length: 400 }, (_, i) => `${(i % 12) + 1}/${(Math.floor(i / 12) % 28) + 1}`).join('\n');
    expect(extract(many)).toHaveLength(MAX_EXTRACT_RESULTS);
  });

  it('ignores input past 50k characters and invalid options', () => {
    expect(extract(`${' '.repeat(50_000)}Dec 21 break`)).toEqual([]);
    expect(extractSchoolDates('Dec 21', { schoolYearStart: 2026.5 })).toEqual([]);
    expect(extractSchoolDates(42 as unknown as string, { schoolYearStart: 2026 })).toEqual([]);
    expect(extract('')).toEqual([]);
  });

  it('uses the written year over the school-year inference', () => {
    expect(ranges('Dec 21, 2030 - Jan 1, 2031')).toEqual([['2030-12-21', '2031-01-01']]);
    expect(extractSchoolDates('Dec 21 - Jan 1', { schoolYearStart: 2027 }).map(item => item.id)).toEqual(['2027-12-21_2028-01-01']);
  });

  it('reads ranges whose end carries its own weekday, and "and" pairs as two dates (critic)', () => {
    expect(ranges('Winter Break: Monday, December 21 – Friday, January 1')).toEqual([['2026-12-21', '2027-01-01']]);
    expect(ranges('Winter Break Mon 12/21 - Fri 1/1')).toEqual([['2026-12-21', '2027-01-01']]);
    expect(ranges('No school Nov 26 and 27')).toEqual([['2026-11-26', '2026-11-26'], ['2026-11-27', '2026-11-27']]);
    expect(ranges('No school Nov 26 & 27, 2026')).toEqual([['2026-11-26', '2026-11-26'], ['2026-11-27', '2026-11-27']]);
  });
});
