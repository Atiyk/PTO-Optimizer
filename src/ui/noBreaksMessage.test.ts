import { describe, expect, it } from 'vitest';
import { noBreaksMessage } from './noBreaksMessage';

describe('noBreaksMessage', () => {
  it('says there is no PTO to place when the budget is 0', () => {
    expect(noBreaksMessage(0, 0)).toBe('You have no PTO days to place. Weekends and public holidays still show on the calendar.');
  });
  it('names the reserve when every day is kept back', () => {
    expect(noBreaksMessage(4, 0)).toBe('All 4 PTO days are kept in reserve. Lower the reserve to plan breaks.');
    expect(noBreaksMessage(1, 0)).toBe('Your 1 PTO day is kept in reserve. Lower the reserve to plan breaks.');
  });
  it('otherwise points at the dates and settings, without a fixed minimum length', () => {
    expect(noBreaksMessage(10, 7)).toBe('No break fits these dates and settings. Try a longer date range or more PTO days.');
  });
});
