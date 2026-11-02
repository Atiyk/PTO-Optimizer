import { describe, it, expect } from 'vitest';
import { readSabbaticalStateFromURL, writeSabbaticalStateToURL } from './sabbaticalUrlState';

describe('readSabbaticalStateFromURL', () => {
  it('defaults every field when the query string is empty', () => {
    const state = readSabbaticalStateFromURL('');
    expect(state).toEqual({
      country: undefined,
      lengthWeeks: 4,
      eligibleFrom: undefined,
      ptoToAdd: 5,
      unpaidWeeksToAdd: 0,
      selectedStart: undefined,
    });
  });

  it('reads every field when present', () => {
    const state = readSabbaticalStateFromURL('?c=DE&len=6&s=2026-11-02&pto=3&unpaid=2&sel=2026-12-21');
    expect(state).toEqual({
      country: 'DE',
      lengthWeeks: 6,
      eligibleFrom: '2026-11-02',
      ptoToAdd: 3,
      unpaidWeeksToAdd: 2,
      selectedStart: '2026-12-21',
    });
  });

  it('clamps out-of-range or garbage numbers instead of trusting them', () => {
    const state = readSabbaticalStateFromURL('?len=999&pto=-5&unpaid=abc');
    expect(state.lengthWeeks).toBe(52);
    expect(state.ptoToAdd).toBe(0);
    expect(state.unpaidWeeksToAdd).toBe(0); // falls back to the default on a non-numeric value
  });
});

describe('writeSabbaticalStateToURL', () => {
  it('round-trips every field exactly', () => {
    const params = new URLSearchParams();
    writeSabbaticalStateToURL(params, {
      country: 'DE',
      lengthWeeks: 6,
      eligibleFrom: '2026-11-02',
      ptoToAdd: 3,
      unpaidWeeksToAdd: 2,
      selectedStart: '2026-12-21',
    });
    const read = readSabbaticalStateFromURL(`?${params.toString()}`);
    expect(read).toEqual({
      country: 'DE',
      lengthWeeks: 6,
      eligibleFrom: '2026-11-02',
      ptoToAdd: 3,
      unpaidWeeksToAdd: 2,
      selectedStart: '2026-12-21',
    });
  });
});


it('ignores malformed sabbatical dates before calendar arithmetic', () => {
  const state = readSabbaticalStateFromURL('?s=garbage&sel=2027-02-30');
  expect(state.eligibleFrom).toBeUndefined();
  expect(state.selectedStart).toBeUndefined();
});
