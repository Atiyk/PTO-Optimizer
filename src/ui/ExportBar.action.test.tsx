import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ActionButton, type ActionResult } from './ExportBar';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('ActionButton async failures', () => {
  it('re-enables the action after a rejected promise and permits a successful retry', async () => {
    const onClick = vi.fn<() => Promise<ActionResult>>()
      .mockRejectedValueOnce(new Error('Clipboard permission denied'))
      .mockResolvedValueOnce({ ok: true, message: 'Link copied' });

    render(<ActionButton label="Copy plan link" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Copy plan link' });

    fireEvent.click(button);
    await waitFor(() => {
      expect((button as HTMLButtonElement).disabled).toBe(false);
      expect(button.textContent).toBe('Action failed — try again');
    });
    expect(screen.getByRole('status').textContent).toBe('Action failed — try again');

    fireEvent.click(button);
    await waitFor(() => {
      expect((button as HTMLButtonElement).disabled).toBe(false);
      expect(button.textContent).toBe('Link copied');
    });
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('preserves the actual failure message for a handled unsuccessful action', async () => {
    const onClick = vi.fn(async (): Promise<ActionResult> => ({
      ok: false, message: "Couldn't copy — try again",
    }));

    render(<ActionButton label="Copy plan link" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Copy plan link' });
    fireEvent.click(button);

    await waitFor(() => {
      expect((button as HTMLButtonElement).disabled).toBe(false);
      expect(button.textContent).toBe("Couldn't copy — try again");
    });
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not let the previous click timer erase retry feedback early', async () => {
    vi.useFakeTimers();
    const onClick = vi.fn<() => Promise<ActionResult>>()
      .mockResolvedValueOnce({ ok: false, message: 'First attempt failed' })
      .mockResolvedValueOnce({ ok: true, message: 'Link copied' });
    render(<ActionButton label="Copy plan link" onClick={onClick} />);
    const button = screen.getByRole('button', { name: 'Copy plan link' });

    await act(async () => { fireEvent.click(button); });
    expect(button.textContent).toBe('First attempt failed');
    await act(async () => { vi.advanceTimersByTime(1500); });
    await act(async () => { fireEvent.click(button); });
    expect(button.textContent).toBe('Link copied');

    // The first click's 2.5-second deadline has now passed, but the retry's has not.
    await act(async () => { vi.advanceTimersByTime(1100); });
    expect(button.textContent).toBe('Link copied');
    expect(screen.getByRole('status').textContent).toBe('Link copied');

    await act(async () => { vi.advanceTimersByTime(1400); });
    expect(button.textContent).toBe('Copy plan link');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('clears pending feedback timers when unmounted', async () => {
    vi.useFakeTimers();
    const onClick = vi.fn(async (): Promise<ActionResult> => ({ ok: true, message: 'Link copied' }));
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    const view = render(<ActionButton label="Copy plan link" onClick={onClick} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy plan link' })); });
    expect(screen.getByRole('button').textContent).toBe('Link copied');
    view.unmount();
    expect(clearSpy).toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(3000); });
  });

});
