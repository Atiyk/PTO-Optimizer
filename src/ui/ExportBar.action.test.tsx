import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ActionButton, type ActionResult } from './ExportBar';

afterEach(() => {
  cleanup();
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
      expect(button).not.toBeDisabled();
      expect(button).toHaveTextContent('Action failed — try again');
    });
    expect(screen.getByRole('status')).toHaveTextContent('Action failed — try again');

    fireEvent.click(button);
    await waitFor(() => {
      expect(button).not.toBeDisabled();
      expect(button).toHaveTextContent('Link copied');
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
      expect(button).not.toBeDisabled();
      expect(button).toHaveTextContent("Couldn't copy — try again");
    });
    expect(onClick).toHaveBeenCalledOnce();
  });
});
