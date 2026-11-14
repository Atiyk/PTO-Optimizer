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
  return container.querySelector('button') as HTMLElement;
}

const visibleTip = () => container!.querySelector('[role="tooltip"]:not([hidden])');

describe('InfoHint (interaction-detail pass: tooltips on keyboard focus, not just hover)', () => {
  // N5: a real button (keyboard-reachable by default) with a short name; the full text is
  // its description, so it is always available to assistive tech even while closed.
  it('is a keyboard-reachable button with a short name and the text as its description', () => {
    const trigger = mount();
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger.getAttribute('type')).toBe('button');
    expect(trigger.tabIndex).toBe(0);
    expect(trigger.getAttribute('aria-label')).toBe('More information');
    const described = document.getElementById(trigger.getAttribute('aria-describedby')!);
    expect(described?.textContent).toBe('Longer explanation text.');
  });

  it('takes a specific accessible name', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root!.render(<InfoHint text="Why." label="About how many breaks" />); });
    expect(container.querySelector('button')!.getAttribute('aria-label')).toBe('About how many breaks');
  });

  it('has a 24px button around the 18px glyph and a 44px touch extension', () => {
    const trigger = mount();
    expect(trigger.className).toMatch(/\bh-6\b/);
    expect(trigger.className).toMatch(/\bw-6\b/);
    // 24px button + 10px a side = 44px.
    expect(trigger.className).toContain('before:-inset-2.5');
  });

  it('opens on tap or click (touch has no hover) and closes on Escape', () => {
    const trigger = mount();
    act(() => { trigger.click(); });
    expect(visibleTip()).not.toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(visibleTip()).toBeNull();
  });

  it('shows no tooltip until hovered or focused', () => {
    mount();
    expect(visibleTip()).toBeNull();
  });

  it('BUG FOUND: a native title attribute does not reliably show on keyboard focus - replaced with a real tooltip that opens on focus, not just hover', () => {
    const trigger = mount();
    // Native focus()/blur() (not a dispatched 'focus'/'blur' event, which doesn't bubble and
    // so never reaches React's root-level listener) - this is real keyboard-equivalent focus.
    act(() => {
      trigger.focus();
    });
    const tooltip = visibleTip();
    expect(tooltip).not.toBeNull();
    expect(tooltip!.textContent).toBe('Longer explanation text.');
  });

  it('closes on blur', () => {
    const trigger = mount();
    act(() => {
      trigger.focus();
    });
    expect(visibleTip()).not.toBeNull();
    act(() => {
      trigger.blur();
    });
    expect(visibleTip()).toBeNull();
  });

  it('also opens on mouse hover, independent of focus', () => {
    const trigger = mount();
    act(() => {
      trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(visibleTip()).not.toBeNull();
    act(() => {
      trigger.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    });
    expect(visibleTip()).toBeNull();
  });
});

describe('InfoHint on touch', () => {
  it('stays open after a tap even though the browser sends a compatibility mouseout', () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root!.render(<InfoHint text="Why." />); });
    const trigger = container.querySelector('button')!;
    act(() => {
      const down = new MouseEvent('pointerdown', { bubbles: true });
      Object.defineProperty(down, 'pointerType', { value: 'touch' });
      trigger.dispatchEvent(down);
      trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      trigger.click();
      trigger.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    });
    expect(container.querySelector('[role="tooltip"]:not([hidden])')).not.toBeNull();
  });
});
