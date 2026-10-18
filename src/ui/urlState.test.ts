import { describe, it, expect } from 'vitest';
import { readSliderStateFromURL, writeSliderStateToURL } from './urlState';

describe('readSliderStateFromURL', () => {
  it('reads explicit w and count params', () => {
    expect(readSliderStateFromURL('?w=70&count=3')).toEqual({ w: 70, breakCount: 3 });
  });

  it('defaults to w=30, count=0 with no params', () => {
    expect(readSliderStateFromURL('')).toEqual({ w: 30, breakCount: 0 });
  });

  it('migrates a legacy objective param to a sensible (w, count) pair instead of erroring', () => {
    expect(readSliderStateFromURL('?objective=most-days-off')).toEqual({ w: 0, breakCount: 0 });
    expect(readSliderStateFromURL('?objective=avoid-peak')).toEqual({ w: 90, breakCount: 0 });
    expect(readSliderStateFromURL('?objective=single-days')).toEqual({ w: 30, breakCount: 7 });
  });

  it('migrates an unrecognised legacy objective value without throwing, falling back to defaults', () => {
    expect(() => readSliderStateFromURL('?objective=some-removed-mode-nobody-remembers')).not.toThrow();
    expect(readSliderStateFromURL('?objective=some-removed-mode-nobody-remembers')).toEqual({ w: 30, breakCount: 0 });
  });

  it('clamps out-of-range or non-multiple-of-10 w to the nearest valid step', () => {
    expect(readSliderStateFromURL('?w=73')).toEqual({ w: 70, breakCount: 0 });
    expect(readSliderStateFromURL('?w=150')).toEqual({ w: 100, breakCount: 0 });
    expect(readSliderStateFromURL('?w=-20')).toEqual({ w: 0, breakCount: 0 });
  });

  it('clamps out-of-range count to 0-7', () => {
    expect(readSliderStateFromURL('?count=99')).toEqual({ w: 30, breakCount: 7 });
    expect(readSliderStateFromURL('?count=-5')).toEqual({ w: 30, breakCount: 0 });
  });
});

describe('writeSliderStateToURL', () => {
  it('writes w and count, and strips every legacy param', () => {
    const params = new URLSearchParams('?objective=most-days-off&shape=single-days&minBreakLength=3&other=keep');
    writeSliderStateToURL(params, { w: 50, breakCount: 2 });
    expect(params.get('w')).toBe('50');
    expect(params.get('count')).toBe('2');
    expect(params.has('objective')).toBe(false);
    expect(params.has('shape')).toBe(false);
    expect(params.has('minBreakLength')).toBe(false);
    expect(params.get('other')).toBe('keep');
  });
});
