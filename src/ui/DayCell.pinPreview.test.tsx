import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DayCell } from './DayCell';

afterEach(cleanup);

function deferred() {
  let resolve!: (text: string | null) => void;
  const promise = new Promise<string | null>((r) => { resolve = r; });
  return { promise, resolve };
}

function cell(pinPreview: (date: string) => Promise<string | null>) {
  return (
    <DayCell
      date="2027-03-03" dayOfMonth={3} category="working" hasOverlap={false} isAlternative={false}
      isToday={false} inBand={false} isHighlighted={false} isBlackout={false} isOutOfRange={false}
      marginalValue={{ deltaDays: 2, ptoCost: 1, multiplier: 3 }} holidayName={undefined}
      hasHover onToggle={() => {}} pinPreview={pinPreview}
    />
  );
}

describe('DayCell pin preview (computed off the main thread)', () => {
  it('shows a neutral line while the preview is computed, then the real outcome', async () => {
    const pending = deferred();
    render(cell(() => pending.promise));
    fireEvent.mouseEnter(screen.getByRole('button', { name: /March 3/ }));
    expect(screen.getByText('Pin it to add it to the plan.')).toBeTruthy();
    await act(async () => pending.resolve('Pin it: 9 days off for 3 PTO days (2 more).'));
    expect(screen.getByText('Pin it: 9 days off for 3 PTO days (2 more).')).toBeTruthy();
  });

  it('never lets an older input\'s late preview overwrite the newer one', async () => {
    const older = deferred();
    const newer = deferred();
    const { rerender } = render(cell(() => older.promise));
    fireEvent.mouseEnter(screen.getByRole('button', { name: /March 3/ }));
    // The plan inputs changed while the old preview was still being computed.
    rerender(cell(() => newer.promise));
    await act(async () => newer.resolve('Pin it: 12 days off for 4 PTO days (3 more).'));
    await act(async () => older.resolve('Pin it: 9 days off for 3 PTO days (2 more).'));
    expect(screen.getByText('Pin it: 12 days off for 4 PTO days (3 more).')).toBeTruthy();
    expect(screen.queryByText(/9 days off/)).toBeNull();
  });
});
