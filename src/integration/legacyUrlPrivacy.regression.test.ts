import { describe, expect, it } from 'vitest';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import {
  buildOverlapShareURL,
  readFullStateFromURL,
  readOverlapPayloadFromURL,
  writeFullStateToURL,
} from '../ui/urlState';

const defaults = {
  rangeStart: '2027-01-01',
  rangeEnd: '2027-12-31',
  budget: 15,
  country: 'US',
};

describe('legacy URL and signed-out partner privacy regression', () => {
  it('roundtrips a legacy pinned/blackout plan without changing its objective or workweek', () => {
    const legacy = '?objective=one-long-trip&s=2027-02-01&e=2027-03-31&b=7&c=US&ww=1111010&p=2027-02-05&r=2027-02-12&bo=2027-02-19&np=21&rv=2';
    const parsed = readFullStateFromURL(legacy, defaults);
    expect(parsed).toMatchObject({
      rangeStart: '2027-02-01', rangeEnd: '2027-03-31',
      budget: 7, w: 20, breakCount: 1, noticePeriodDays: 21, reserveDays: 2,
    });
    expect(parsed.workWeek).toEqual([true, true, true, true, false, true, false]);
    const params = new URLSearchParams();
    writeFullStateToURL(params, {
      ...parsed,
      country: parsed.country ?? 'US',
      subdivision: parsed.subdivision,
      expiryDate: parsed.expiryDate ?? '2027-12-31',
      forced: { '2027-02-05': 'include', '2027-02-12': 'exclude' },
      altFridayStart: parsed.altFridayStart ?? '',
      peakCapStart: parsed.peakCapStart ?? '',
      peakCapEnd: parsed.peakCapEnd ?? '',
    });
    expect(params.has('objective')).toBe(false);
    expect(params.get('s')).toBe('2027-02-01');
    expect(params.get('e')).toBe('2027-03-31');
    const restored = readFullStateFromURL('?' + params.toString(), defaults);
    expect(restored.workWeek).toEqual(parsed.workWeek);
    expect(restored).toMatchObject({
      rangeStart: parsed.rangeStart, rangeEnd: parsed.rangeEnd,
      budget: parsed.budget, w: parsed.w, breakCount: parsed.breakCount,
      pinnedDays: parsed.pinnedDays, ruledOutDays: parsed.ruledOutDays,
      blackouts: parsed.blackouts, noticePeriodDays: 21, reserveDays: 2,
    });
  });

  it('keeps partner links limited to date-only overlap, never personal plan or calendar fields', () => {
    const secret = 'private-salary-and-calendar-title';
    const url = buildOverlapShareURL('https://pto.example', '/plan', [
      '2027-01-04', '2027-01-05',
    ]);
    const shared = new URL(url);
    expect([...shared.searchParams.keys()]).toEqual(['ov']);
    expect(shared.search).not.toContain(secret);
    expect(shared.search).not.toMatch(/(?:^|[?&])(b|eh|od|p|bo|cc|xd|np|rv)=/);
    expect(readOverlapPayloadFromURL(shared.search)).toEqual(['2027-01-04', '2027-01-05']);
    const recipient = readFullStateFromURL(shared.search, defaults);
    expect(recipient.workWeek).toEqual(DEFAULT_WORK_WEEK);
    expect(recipient.budget).toBe(defaults.budget);
    expect(recipient.pinnedDays).toEqual([]);
    expect(recipient.blackouts).toEqual([]);
    expect(recipient.employerCalendar).toBeUndefined();
  });

  it('rejects malformed and oversized date payloads rather than injecting them into a recipient plan', () => {
    expect(readOverlapPayloadFromURL('?ov=2027-02-30,2027-02-28,not-a-date,2027-02-28'))
      .toEqual(['2027-02-28']);
    expect(readOverlapPayloadFromURL('?ov=' + '2027-01-01,'.repeat(5000))).toEqual([]);
  });
});
