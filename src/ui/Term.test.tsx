import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Term } from './Term';

// Stage 3B: first component-level test in this repo - added
// @testing-library/react/dom as devDependencies for it (flagged in PROGRESS.md's
// "Feature 1" section as a new dependency, since this is an unattended run).
// vite.config.ts's test.globals is false, so cleanup isn't auto-registered - done
// explicitly here instead of relying on RTL's global-afterEach detection.
afterEach(cleanup);

describe('Term', () => {
  it('renders the term name and shows no popover until interacted with', () => {
    render(<Term id="accrual" />);
    expect(screen.getByText('accrual')).toBeTruthy();
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens on hover and closes on mouse leave', () => {
    render(<Term id="accrual" />);
    const trigger = screen.getByRole('button');
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens on keyboard focus and closes on blur — the keyboard-only path', () => {
    render(<Term id="accrual" />);
    const trigger = screen.getByRole('button');
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('closes on Escape while focused — a keyboard user can dismiss it without blurring', () => {
    render(<Term id="accrual" />);
    const trigger = screen.getByRole('button');
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.keyDown(trigger, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('opens on tap (click), the touch-device path with no hover', () => {
    render(<Term id="accrual" />);
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);
    expect(screen.getByRole('tooltip')).toBeTruthy();
  });

  it('the trigger is a real focusable element with an accessible label', () => {
    render(<Term id="accrual" />);
    const trigger = screen.getByRole('button');
    expect(trigger.getAttribute('tabindex')).toBe('0');
    expect(trigger.getAttribute('aria-label')).toContain('accrual');
  });

  it('falls back to its children (or id) for an unknown term id, without crashing', () => {
    render(<Term id="not-a-real-term">fallback text</Term>);
    expect(screen.getByText('fallback text')).toBeTruthy();
  });
});
