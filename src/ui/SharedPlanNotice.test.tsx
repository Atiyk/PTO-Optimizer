import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SharedPlanNotice } from './SharedPlanNotice';
import { sharedPlanChangeText } from './shareSnapshot';

afterEach(() => { cleanup(); delete window.plausible; document.body.innerHTML = ''; });

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
    expect(screen.getByTestId('shared-plan-notice').textContent).toMatch(/Check the holidays your own employer gives you/);
    expect(screen.queryByTestId('shared-plan-recalculated')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Use my saved calendar' })).toBeNull();
    view.rerender(<SharedPlanNotice differences={{ planner: false, holidays: true }} savedCalendarOff onUseSavedCalendar={onUse} />);
    expect(screen.getByTestId('shared-plan-recalculated').textContent).toMatch(/older holiday data/);
    fireEvent.click(screen.getByRole('button', { name: 'Use my saved calendar' }));
    expect(onUse).toHaveBeenCalledOnce();
  });

  it('frames the link for a recipient: who it is from, what it is based on, one way to make it theirs', () => {
    render(<SharedPlanNotice differences={{ planner: false, holidays: false }} savedCalendarOff={false} onUseSavedCalendar={() => {}} />);
    const notice = screen.getByTestId('shared-plan-notice');
    expect(notice.textContent).toMatch(/^Someone shared a time-off plan with you\./);
    expect(notice.textContent).toMatch(/built from the PTO days, country, dates and holidays in the link\./);
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Use my own PTO days']);
    const holidays = screen.getByRole('link', { name: 'Check your company holidays' });
    expect(holidays.getAttribute('href')).toBe('#planning-assumptions');
  });

  it('“Use my own PTO days” focuses the planner’s PTO field and records the event by name only', () => {
    const event = vi.fn();
    window.plausible = event;
    const field = document.createElement('div');
    field.innerHTML = '<label for="pto-budget">PTO days available</label><input id="pto-budget" type="text" value="20" />';
    document.body.appendChild(field);
    render(<SharedPlanNotice differences={{ planner: false, holidays: false }} savedCalendarOff={false} onUseSavedCalendar={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Use my own PTO days' }));
    expect(document.activeElement?.id).toBe('pto-budget');
    expect(event).toHaveBeenCalledExactlyOnceWith('shared_plan_made_own', { url: window.location.origin + '/' });
  });

  it('never repeats a sender value, whatever the differences', () => {
    for (const differences of [{ planner: false, holidays: false }, { planner: true, holidays: true }]) {
      const view = render(<SharedPlanNotice differences={differences} savedCalendarOff onUseSavedCalendar={() => {}} />);
      const text = screen.getByTestId('shared-plan-notice').textContent ?? '';
      expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}|notice period|accrual|expir|carryover|payout/i);
      view.unmount();
    }
  });
});
