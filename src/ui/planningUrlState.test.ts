import { describe, expect, it } from 'vitest';
import { readFullStateFromURL, writeFullStateToURL } from './urlState';

const defaults = { rangeStart: '2027-01-01', rangeEnd: '2027-12-31', budget: 15, country: 'US' };

describe('consumer planning URL compatibility', () => {
  it('keeps old links on the unchanged solver, while fresh plans choose balanced/minimum3', () => {
    const legacy = readFullStateFromURL('?c=US&s=2027-01-01&e=2027-12-31&b=15&w=30&count=0', defaults);
    expect(legacy.planningVersion).toBeUndefined();
    expect(legacy.breakCount).toBe(0);
    expect(readFullStateFromURL('', defaults)).toMatchObject({ planningVersion: 2, planningStyle: 'balanced', minimumBreakDays: 3, breakCount: 3 });
  });
  it('round trips each new planning style and its explicit minimum', () => {
    for (const style of ['balanced', 'long-breaks', 'more-breaks', 'custom']) {
      const state = readFullStateFromURL(`?pv=2&ps=${style}&mb=5&s=2027-01-01&e=2027-12-31&b=15`, defaults);
      const params = new URLSearchParams();
      writeFullStateToURL(params, { ...state, country: state.country!, subdivision: state.subdivision, forced: {}, expiryDate: state.expiryDate ?? '', altFridayStart: '', peakCapStart: '', peakCapEnd: '' });
      expect(readFullStateFromURL(params.toString(), defaults)).toMatchObject({ planningVersion: 2, planningStyle: style, minimumBreakDays: 5 });
    }
  });
  it('bounds untrusted settings without affecting legacy parameter migration', () => {
    for (const value of ['NaN', '-1', '61', '4.5']) expect(readFullStateFromURL(`?pv=2&mb=${value}`, defaults).minimumBreakDays).toBe(3);
    expect(readFullStateFromURL('?pv=2&mb=0&ps=unknown', defaults)).toMatchObject({ minimumBreakDays: 0, planningStyle: 'balanced' });
    expect(readFullStateFromURL('?objective=one-long-trip', defaults)).toMatchObject({ w: 20, breakCount: 1 });
  });
});
