import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrimaryControls } from './PrimaryControls';

const baseProps = {
  country: 'US',
  onChangeCountry: () => {},
  rangeStart: '2027-01-01',
  rangeEnd: '2027-03-31',
  onChangeRangeStart: () => {},
  onChangeRangeEnd: () => {},
  onChangeBudget: () => {},
  onChangeReserveDays: () => {},
  onToggleUnlimitedPto: () => {},
};

afterEach(cleanup);

describe('PrimaryControls (Phase 3.1/3.2: reserve days, unlimited PTO)', () => {
  it('keeps the live budget slider and exact number input synchronized', () => {
    function LiveControls() {
      const [budget, setBudget] = useState(15);
      return <PrimaryControls {...baseProps} budget={budget} onChangeBudget={setBudget} budgetSpent={budget} reserveDays={0} effectiveBudget={budget} unlimitedPto={false} />;
    }
    render(<LiveControls />);
    const slider = screen.getByRole<HTMLInputElement>('slider', { name: 'Adjust PTO days' });
    const exact = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'PTO days available' });
    fireEvent.change(slider, { target: { value: '9' } });
    expect(exact.value).toBe('9');
    fireEvent.change(exact, { target: { value: '17' } });
    expect(slider.value).toBe('17');
    expect(slider.getAttribute('aria-valuetext')).toBe('17 PTO days available');
    expect(screen.getByLabelText('Start date').getAttribute('type')).toBe('date');
    expect(screen.getByLabelText('End date').getAttribute('type')).toBe('date');
  });
  it('renders the "Keep in reserve" field and the unlimited-PTO checkbox', () => {
    const html = renderToStaticMarkup(
      <PrimaryControls {...baseProps} budget={15} budgetSpent={12} reserveDays={3} effectiveBudget={12} unlimitedPto={false} />,
    );
    expect(html).toContain('Keep in reserve');
    expect(html).toContain('I have unlimited PTO');
  });

  it('does NOT show the unspent-budget warning when the gap is exactly the reserve - a deliberate choice, not a solver failure', () => {
    // budget=15, reserveDays=3 -> effectiveBudget=12. The solver spent all 12 it was given;
    // the remaining 3 are reserved on purpose, not left over because the solver couldn't
    // use them.
    const html = renderToStaticMarkup(
      <PrimaryControls {...baseProps} budget={15} budgetSpent={12} reserveDays={3} effectiveBudget={12} unlimitedPto={false} />,
    );
    expect(html).not.toContain('add no days off at any position');
  });

  it('DOES show the unspent-budget warning when the solver itself left plannable days unused', () => {
    // effectiveBudget=12 (after reserve), but the solver only spent 10 - genuinely unused.
    const html = renderToStaticMarkup(
      <PrimaryControls {...baseProps} budget={15} budgetSpent={10} reserveDays={3} effectiveBudget={12} unlimitedPto={false} />,
    );
    expect(html).toContain('Using 10 of 12 planned days');
    expect(html).toContain('remain unplanned under your current constraints');
  });

  it('shows the unlimited-PTO explanatory line only once the checkbox is on', () => {
    const off = renderToStaticMarkup(
      <PrimaryControls {...baseProps} budget={15} budgetSpent={15} reserveDays={0} effectiveBudget={15} unlimitedPto={false} />,
    );
    expect(off).not.toContain('Most people with unlimited PTO');

    const on = renderToStaticMarkup(
      <PrimaryControls {...baseProps} budget={15} budgetSpent={15} reserveDays={0} effectiveBudget={15} unlimitedPto={true} />,
    );
    expect(on).toContain('Most people with unlimited PTO take 15 days or fewer');
  });
});
