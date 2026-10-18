import { describe, it, expect } from 'vitest';
import { classifyDay } from './dayCategory';

const base = { isBlackout: false, forcedState: undefined, isBaseOff: false, isWeekend: false, isChosen: false };

describe('classifyDay', () => {
  it('a forced-include day is "pinned", never "public-holiday" - this is the bug the regression covers', () => {
    // Before the fix, a forced-include day was indistinguishable from a real holiday
    // because both fell through to the same 'public-holiday' branch (isBaseOff is true
    // for both, since forced-include adds the date to the same effective off-days set a
    // real holiday is in).
    const genuineHoliday = classifyDay({ ...base, isBaseOff: true });
    const pinnedDay = classifyDay({ ...base, isBaseOff: true, forcedState: 'include' });
    expect(genuineHoliday).toBe('public-holiday');
    expect(pinnedDay).toBe('pinned');
    expect(pinnedDay).not.toBe(genuineHoliday);
  });

  it('a forced-include day is also distinct from a plain suggested-pto day', () => {
    const suggested = classifyDay({ ...base, isChosen: true });
    const pinned = classifyDay({ ...base, forcedState: 'include' });
    expect(suggested).toBe('suggested-pto');
    expect(pinned).toBe('pinned');
    expect(pinned).not.toBe(suggested);
  });

  it('forced-include wins over every other signal, including a day that is also chosen or a weekend', () => {
    expect(classifyDay({ ...base, forcedState: 'include', isChosen: true })).toBe('pinned');
    expect(classifyDay({ ...base, forcedState: 'include', isWeekend: true })).toBe('pinned');
    expect(classifyDay({ ...base, forcedState: 'include', isBaseOff: true, isChosen: true })).toBe('pinned');
  });

  it('blackout (forced-exclude or manual) always wins, even over a forced-include - a day cannot be both', () => {
    expect(classifyDay({ ...base, isBlackout: true, forcedState: 'include' })).toBe('working');
  });

  it('a month with nothing chosen and nothing pinned produces only weekend/public-holiday/working, never a fill category', () => {
    const scenarios = [
      { ...base },
      { ...base, isWeekend: true },
      { ...base, isBaseOff: true },
      { ...base, isBlackout: true },
    ];
    for (const s of scenarios) {
      const category = classifyDay(s);
      expect(category).not.toBe('suggested-pto');
      expect(category).not.toBe('pinned');
    }
  });

  it('plain suggested/holiday/weekend/working classification is unaffected by the pinned addition', () => {
    expect(classifyDay(base)).toBe('working');
    expect(classifyDay({ ...base, isWeekend: true })).toBe('weekend');
    expect(classifyDay({ ...base, isBaseOff: true })).toBe('public-holiday');
    expect(classifyDay({ ...base, isChosen: true })).toBe('suggested-pto');
  });
});
