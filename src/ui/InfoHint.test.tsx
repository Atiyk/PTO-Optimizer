import { describe, it, expect, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { InfoHint } from './InfoHint';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<InfoHint text="Longer explanation text." />);
  });
  return container.querySelector('[tabindex="0"]') as HTMLElement;
}

describe('InfoHint (interaction-detail pass: tooltips on keyboard focus, not just hover)', () => {
  it('is reachable by keyboard (tabIndex 0) and always carries the text via aria-label', () => {
    const trigger = mount();
    expect(trigger.tabIndex).toBe(0);
    expect(trigger.getAttribute('aria-label')).toBe('Longer explanation text.');
  });

  it('shows no tooltip until hovered or focused', () => {
    mount();
    expect(container!.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('BUG FOUND: a native title attribute does not reliably show on keyboard focus - replaced with a real tooltip that opens on focus, not just hover', () => {
    const trigger = mount();
    // Native focus()/blur() (not a dispatched 'focus'/'blur' event, which doesn't bubble and
    // so never reaches React's root-level listener) - this is real keyboard-equivalent focus.
    act(() => {
      trigger.focus();
    });
    const tooltip = container!.querySelector('[role="tooltip"]');
    expect(tooltip).not.toBeNull();
    expect(tooltip!.textContent).toBe('Longer explanation text.');
  });

  it('closes on blur', () => {
    const trigger = mount();
    act(() => {
      trigger.focus();
    });
    expect(container!.querySelector('[role="tooltip"]')).not.toBeNull();
    act(() => {
      trigger.blur();
    });
    expect(container!.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('also opens on mouse hover, independent of focus', () => {
    const trigger = mount();
    act(() => {
      trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(container!.querySelector('[role="tooltip"]')).not.toBeNull();
    act(() => {
      trigger.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    });
    expect(container!.querySelector('[role="tooltip"]')).toBeNull();
  });
});
