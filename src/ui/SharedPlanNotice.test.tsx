import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SharedPlanNotice } from './SharedPlanNotice';
import { sharedPlanChangeText } from './shareSnapshot';

afterEach(cleanup);

describe('shared plan notice (issue 9)', () => {
  it('names only what changed, never a sender value', () => {
    expect(sharedPlanChangeText({ planner: false, holidays: false })).toBeUndefined();
    expect(sharedPlanChangeText({ planner: true, holidays: false })).toBe('This link was made with an earlier version of the planner, so these breaks were recalculated and may not match what the sender saw.');
    expect(sharedPlanChangeText({ planner: true, holidays: true })).toMatch(/earlier version of the planner and older holiday data/);
  });

  it('always says private settings are not included, and offers the saved calendar only when one is off', () => {
    const onUse = vi.fn();
    const view = render(<SharedPlanNotice differences={{ planner: false, holidays: false }} savedCalendarOff={false} onUseSavedCalendar={onUse} />);
    expect(screen.getByTestId('shared-plan-notice').textContent).toMatch(/Anything the sender kept private, such as company holidays or time off they already booked, isn.t included\./);
    expect(screen.queryByTestId('shared-plan-recalculated')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    view.rerender(<SharedPlanNotice differences={{ planner: false, holidays: true }} savedCalendarOff onUseSavedCalendar={onUse} />);
    expect(screen.getByTestId('shared-plan-recalculated').textContent).toMatch(/older holiday data/);
    fireEvent.click(screen.getByRole('button', { name: 'Use my saved calendar' }));
    expect(onUse).toHaveBeenCalledOnce();
  });
});
