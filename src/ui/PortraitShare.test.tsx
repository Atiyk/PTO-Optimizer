import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortraitShare } from './PortraitShare';

const actions = vi.hoisted(() => ({ copy: vi.fn(), download: vi.fn() }));
vi.mock('./portraitExport', async importOriginal => ({
  ...await importOriginal<typeof import('./portraitExport')>(),
  copyPortraitImage: actions.copy,
  downloadPortraitImage: actions.download,
}));
afterEach(() => { cleanup(); vi.restoreAllMocks(); actions.copy.mockReset(); actions.download.mockReset(); });

function renderShare() {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), measureText: () => ({ width: 100 }),
  } as unknown as CanvasRenderingContext2D);
  return render(<PortraitShare rangeStart="2027-01-01" rangeEnd="2027-12-31" breaks={[{ start: '2027-07-03', end: '2027-07-11', ptoCost: 4, totalDaysOff: 9 }]} holidayAssumption="public" remainingBalance={98123.75} />);
}

describe('portrait preview controls', () => {
  it('defaults to a hidden balance and makes the actual export available after preview', async () => {
    renderShare();
    fireEvent.click(screen.getByRole('button', { name: 'Preview portrait share card' }));
    const balance = screen.getByRole('checkbox', { name: 'Include my PTO balance.' }) as HTMLInputElement;
    expect(balance.checked).toBe(false);
    expect(screen.queryByText(/98123\.75/)).toBeNull();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Copy portrait image' }) as HTMLButtonElement).disabled).toBe(false));
    expect(document.querySelector('canvas')?.width).toBe(1080);
    expect(document.querySelector('canvas')?.height).toBe(1350);
    fireEvent.click(balance);
    expect(screen.getByText(/PTO remaining: 98123\.75 days/)).toBeTruthy();
  });

  it('reports an actual clipboard fallback and a failed download accurately', async () => {
    actions.copy.mockResolvedValue({ method: 'download' });
    actions.download.mockResolvedValue(false);
    renderShare();
    fireEvent.click(screen.getByRole('button', { name: 'Preview portrait share card' }));
    const copy = screen.getByRole('button', { name: 'Copy portrait image' });
    await waitFor(() => expect((copy as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(copy);
    await screen.findByText('PNG downloaded instead; image clipboard is unavailable.');
    fireEvent.click(screen.getByRole('button', { name: 'Download portrait PNG' }));
    await screen.findByText('Could not download the PNG. Please try again.');
    expect(actions.download).toHaveBeenCalledTimes(1);
  });
});
