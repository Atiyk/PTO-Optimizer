import { describe, it, expect, afterEach, vi } from 'vitest';
import { track } from './analytics';

afterEach(() => {
  delete window.plausible;
});

describe('track', () => {
  it('is a no-op, never throwing, when window.plausible is undefined (plausible.io blocked, offline, or a unit test)', () => {
    expect(window.plausible).toBeUndefined();
    expect(() => track('Solve completed')).not.toThrow();
  });

  it('forwards the bare event name to window.plausible, with no extra payload', () => {
    const spy = vi.fn();
    window.plausible = spy;
    track('ICS downloaded');
    expect(spy).toHaveBeenCalledExactlyOnceWith('ICS downloaded');
  });

  it('never throws even if window.plausible itself throws', () => {
    window.plausible = () => {
      throw new Error('blocked by an extension');
    };
    expect(() => track('Image copied')).not.toThrow();
  });
});
