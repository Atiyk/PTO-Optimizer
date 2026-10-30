import { describe, expect, it } from 'vitest';
import { blocksForDay, covers, hoursIn, leaveInterval, localInterval, localParts, parseHhmm, zonedToUtc } from './timeBlocks';

const LA = 'America/Los_Angeles';

describe('time blocks', () => {
  it('an ordinary day has 48 half-hour blocks labelled in local time', () => {
    const b = blocksForDay('2026-10-28', LA);
    expect(b).toHaveLength(48);
    expect(b[0]!.key).toBe('2026-10-28T00:00');
    expect(b[28]!.key).toBe('2026-10-28T14:00');
    expect(b[28]!.utcStart).toBe(Date.UTC(2026, 9, 28, 21, 0)); // PDT = UTC−7
    expect(b.every((x) => x.utcEnd - x.utcStart === 30 * 60_000)).toBe(true);
  });

  it('DST spring-forward: 46 blocks and no 02:00 or 02:30', () => {
    const b = blocksForDay('2026-03-08', LA);
    expect(b).toHaveLength(46);
    expect(b.map((x) => x.key)).not.toContain('2026-03-08T02:00');
    expect(b.map((x) => x.key)).toContain('2026-03-08T03:00');
  });

  it('DST fall-back: 50 blocks; the repeated hour appears twice, the second with fold 1', () => {
    const b = blocksForDay('2026-11-01', LA);
    expect(b).toHaveLength(50);
    const ones = b.filter((x) => x.startMinute === 60);
    expect(ones.map((x) => x.key)).toEqual(['2026-11-01T01:00', '2026-11-01T01:00b']);
    expect(ones[1]!.utcStart - ones[0]!.utcStart).toBe(3_600_000);
  });

  it('other time zones and block sizes', () => {
    expect(blocksForDay('2026-10-28', 'UTC', 60)).toHaveLength(24);
    expect(blocksForDay('2026-10-28', 'Asia/Kolkata')[0]!.utcStart).toBe(Date.UTC(2026, 9, 27, 18, 30));
  });

  it('a non-existent local time moves forward by the DST shift; an ambiguous one takes the first occurrence', () => {
    const gap = zonedToUtc('2026-03-08', 150, LA); // 02:30 does not exist
    expect(localParts(gap, LA)).toEqual({ date: '2026-03-08', minute: 210 });
    const amb = zonedToUtc('2026-11-01', 90, LA); // 01:30 happens twice
    expect(amb).toBe(Date.UTC(2026, 10, 1, 8, 30)); // PDT occurrence
  });

  it('shifts crossing midnight end on the next day', () => {
    const night = localInterval('2026-10-28', parseHhmm('22:00'), parseHhmm('06:00'), LA);
    expect(hoursIn(night)).toBe(8);
    const next = blocksForDay('2026-10-29', LA);
    expect(covers(night, { start: next[0]!.utcStart, end: next[0]!.utcEnd })).toBe(true);
    expect(covers(night, { start: next[12]!.utcStart, end: next[12]!.utcEnd })).toBe(false);
    // A night shift across fall-back is 9 real hours.
    expect(hoursIn(localInterval('2026-10-31', 1320, 360, LA))).toBe(9);
    expect(hoursIn(localInterval('2026-10-28', 420, 1440, LA))).toBe(17);
  });

  it('part-day leave maps to the right blocks', () => {
    const day = blocksForDay('2026-10-28', LA);
    const am = leaveInterval('2026-10-28', 'am', LA);
    const pm = leaveInterval('2026-10-28', 'pm', LA);
    const hrs = leaveInterval('2026-10-28', 'hours', LA, { startMinute: 840, endMinute: 1080 });
    const inside = (iv: { start: number; end: number }) => day.filter((b) => covers(iv, { start: b.utcStart, end: b.utcEnd })).map((b) => b.startMinute);
    expect(inside(am)).toHaveLength(24);
    expect(inside(pm)[0]).toBe(720);
    expect(inside(hrs)).toEqual([840, 870, 900, 930, 960, 990, 1020, 1050]);
    expect(hoursIn(leaveInterval('2026-11-01', 'full', LA))).toBe(25);
  });

  it('parses times strictly', () => {
    expect(parseHhmm('7:30')).toBe(450);
    expect(parseHhmm('24:00')).toBe(1440);
    expect(() => parseHhmm('25:00')).toThrow();
    expect(() => parseHhmm('noon')).toThrow();
  });
});
