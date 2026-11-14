import { describe, it, expect, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { DayCell } from './DayCell';

afterEach(cleanup);

/** The planner hides the calendar while it re-plans ("Updating the calendar…") and then
 * mounts it again, so the day button that held focus is replaced by a new one. This harness
 * does the same: any action unmounts the day, and `finish()` brings it back. */
function Harness({ hasHover }: { hasHover: boolean }) {
  const [pending, setPending] = useState(false);
  useEffect(() => { (window as unknown as { finishPlan: () => void }).finishPlan = () => setPending(false); }, []);
  return (
    <div>
      <button type="button">Elsewhere</button>
      {pending ? <p>Updating the calendar…</p> : (
        <DayCell
          date="2026-07-07" dayOfMonth={7} category="working" hasOverlap={false} isAlternative={false}
          isToday={false} inBand={false} isHighlighted={false} isBlackout={false} isOutOfRange={false}
          marginalValue={null} holidayName={undefined} hasHover={hasHover}
          onToggle={() => setPending(true)}
          onSetState={() => setPending(true)}
        />
      )}
    </div>
  );
}
const finish = () => act(() => (window as unknown as { finishPlan: () => void }).finishPlan());
const day = () => screen.getByRole('button', { name: /July 7/ });

describe('DayCell focus return after a plan change (N-P2-1, WCAG 2.4.3)', () => {
  it('phone sheet: after choosing an option, focus lands on the re-mounted day, not <body>', () => {
    render(<Harness hasHover={false} />);
    fireEvent.click(day(), { detail: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Take this day off' }));
    expect(screen.getByText('Updating the calendar…')).toBeTruthy();
    finish();
    expect(document.activeElement).toBe(day());
  });

  it('desktop: Enter on a day pins it and focus stays on that day after the re-plan', () => {
    render(<Harness hasHover={true} />);
    day().focus();
    // Native keyboard activation of a button is a click with detail 0.
    fireEvent.click(day(), { detail: 0 });
    expect(screen.getByText('Updating the calendar…')).toBeTruthy();
    finish();
    expect(document.activeElement).toBe(day());
  });

  it('never steals focus the person has already moved somewhere else', () => {
    render(<Harness hasHover={true} />);
    day().focus();
    fireEvent.click(day(), { detail: 0 });
    const elsewhere = screen.getByRole('button', { name: 'Elsewhere' });
    elsewhere.focus();
    finish();
    expect(document.activeElement).toBe(elsewhere);
  });
});
