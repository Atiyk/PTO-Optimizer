import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTodayISO } from './useTodayISO';

afterEach(() => vi.useRealTimers());

describe('useTodayISO', () => {
  it('uses the local date and advances at local midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 59));
    const { result, unmount } = renderHook(() => useTodayISO());
    expect(result.current).toBe('2026-12-31');
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current).toBe('2027-01-01');
    unmount();
  });

  it('refreshes on focus after the clock changes while away', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 59));
    const { result, unmount } = renderHook(() => useTodayISO());
    vi.setSystemTime(new Date(2027, 0, 2, 1));
    act(() => window.dispatchEvent(new Event('focus')));
    expect(result.current).toBe('2027-01-02');
    unmount();
  });
});
