import { describe, expect, it } from 'vitest';
import { holidayChipLabel, holidayDisplayName, holidayDisplayNames, employerPlaceLabel } from './holidayDisplayNames';
import { holidayFile } from '../autopilot/feedTestHolidays';
import { getStateHolidaysFallback } from '@daysoff/engine/data/usStateHolidays';
import { employerExtraRules } from './employerHolidayChoices';

describe('US holiday display names', () => {
  it('snapshot: every US name the planner can show (national, state, employer extras)', () => {
    const names = new Set<string>();
    for (const year of [2026, 2027, 2028]) {
      for (const raw of (holidayFile('US', year) as { name: string }[] | null) ?? []) names.add(raw.name);
      for (const state of ['US-CA', 'US-TX', 'US-MA', 'US-NY', 'US-IL']) for (const h of getStateHolidaysFallback(state, year)) names.add(h.name);
    }
    for (const rule of employerExtraRules('US')) names.add(rule.name);
    const shown = Object.fromEntries([...names].sort().map((name) => [name, holidayDisplayName(name, 'US')]));
    expect(Object.values(shown)).not.toContain('Labour Day');
    expect(shown).toMatchSnapshot();
  });

  it('renames only for the right country and keeps combined labels', () => {
    expect(holidayDisplayName('Labour Day', 'US')).toBe('Labor Day');
    expect(holidayDisplayName('Labour Day', 'AU')).toBe('Labour Day');
    expect(holidayDisplayName("St. Stephen's Day", 'GB')).toBe('Boxing Day');
    expect(holidayDisplayNames('Labour Day / Company day', 'US')).toBe('Labor Day / Company day');
    expect(holidayChipLabel('Martin Luther King, Jr. Day', 'US')).toBe('MLK Day');
    expect(employerPlaceLabel('US')).toBe('United States');
    expect(employerPlaceLabel('US', 'US-CA')).toBe('California, United States');
  });
});
