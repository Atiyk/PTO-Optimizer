import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { YearStrip } from './YearStrip';

afterEach(cleanup);

describe('holiday timeline accessibility', () => {
  it('describes the actual selected dates and exposes holiday details to Enter and Space', () => {
    render(<YearStrip today="2027-12-01" stripEnd="2028-02-29" holidays={[{ date: '2027-12-25', nominalDate: '2027-12-25', name: 'Christmas', countryCode: 'US', counties: null }]} bridgeableHolidayDates={new Set()} />);
    expect(screen.getByLabelText(/A timeline from December 1, 2027 through February 29, 2028/)).toBeTruthy();
    const holiday = screen.getByRole('button', { name: 'Christmas, 2027-12-25' });
    expect(holiday.getAttribute('aria-pressed')).toBe('false');
    fireEvent.keyDown(holiday, { key: 'Enter' });
    expect(holiday.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('Christmas — 24 days away')).toBeTruthy();
    fireEvent.keyDown(holiday, { key: ' ' });
    expect(holiday.getAttribute('aria-pressed')).toBe('false');
  });
});
