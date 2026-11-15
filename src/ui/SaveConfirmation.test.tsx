import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { SaveConfirmation } from './SaveConfirmation';
import { PLAN_SAVED_MESSAGE } from './pinnedPlanStore';
import { readRetentionStatus } from '../personal/retentionStatus';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const realUserAgent = navigator.userAgent;
const setUserAgent = (value: string) => Object.defineProperty(navigator, 'userAgent', { configurable: true, value });

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); localStorage.clear(); setUserAgent(realUserAgent); vi.restoreAllMocks(); });

describe('save confirmation (P3 storage honesty)', () => {
  it('says where the plan is stored and offers Add to calendar and Back up', () => {
    render(<SaveConfirmation message={PLAN_SAVED_MESSAGE} />);
    const box = screen.getByTestId('save-confirmation');
    expect(within(box).getByRole('status').textContent).toBe('Saved in this browser on this device.');
    expect(box.textContent).toContain('Not in an account and not synced.');
    expect(within(box).getAllByRole('button').map((b) => b.textContent)).toEqual(['Add to calendar', 'Back up']);
  });

  it('Add to calendar uses the planner’s own calendar download', () => {
    const download = document.createElement('button');
    download.id = 'shortcut-download-ics';
    const clicked = vi.fn();
    download.addEventListener('click', clicked);
    document.body.append(download);
    render(<SaveConfirmation message={PLAN_SAVED_MESSAGE} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to calendar' }));
    expect(clicked).toHaveBeenCalledTimes(1);
    download.remove();
  });

  it('Back up downloads every saved item and records when', async () => {
    localStorage.setItem('gapless.personal.pinned-plans.v1', '{"version":1,"plans":[]}');
    let blob: Blob | undefined;
    Object.assign(URL, { createObjectURL: vi.fn((value: Blob) => { blob = value; return 'blob:x'; }), revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<SaveConfirmation message={PLAN_SAVED_MESSAGE} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back up' }));
    expect(await screen.findByText(/Backup file downloaded/)).toBeTruthy();
    expect(click).toHaveBeenCalled();
    expect(blob?.type).toBe('application/json');
    expect(readRetentionStatus().lastBackupAt).toBeTruthy();
    expect(screen.getByText(/Backup file downloaded/)).toBeTruthy();
  });

  it('shows other pin messages as the plain status they were', () => {
    render(<SaveConfirmation message="Saved plan removed in this browser." />);
    expect(screen.getByRole('status').textContent).toBe('Saved plan removed in this browser.');
    expect(screen.queryByTestId('save-confirmation')).toBeNull();
  });

  it('renders nothing without a message (never on first load)', () => {
    const { container } = render(<SaveConfirmation message="" />);
    expect(container.innerHTML).toBe('');
  });

  it('on iOS Safari, adds one dismissible Home Screen line that promises no sync or permanence', () => {
    setUserAgent(IPHONE_SAFARI);
    render(<SaveConfirmation message={PLAN_SAVED_MESSAGE} />);
    const hint = screen.getByTestId('install-hint');
    expect(hint.textContent).toContain('Add Timebower to your Home Screen so your saved plans stay on this iPhone: tap Share, then Add to Home Screen.');
    expect(hint.textContent).not.toMatch(/sync|forever|always|guarantee|never lose/i);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    fireEvent.click(within(hint).getByRole('button', { name: 'Not now' }));
    expect(screen.queryByTestId('install-hint')).toBeNull();
    cleanup();
    render(<SaveConfirmation message={PLAN_SAVED_MESSAGE} />);
    expect(screen.queryByTestId('install-hint')).toBeNull();
  });

  it('on Chromium, offers Install only after the browser offered an install', async () => {
    const { captureInstallPrompt } = await import('../pwa/installOffer');
    captureInstallPrompt(window);
    render(<SaveConfirmation message={PLAN_SAVED_MESSAGE} />);
    expect(screen.queryByTestId('install-hint')).toBeNull();
    const prompt = vi.fn(async () => {});
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt, userChoice: Promise.resolve({ outcome: 'dismissed' as const }) });
    await import('react').then(({ act }) => act(() => { window.dispatchEvent(event); }));
    expect(event.defaultPrevented).toBe(true);
    const hint = screen.getByTestId('install-hint');
    expect(hint.textContent).toContain('They stay in this browser’s storage on this device.');
    fireEvent.click(within(hint).getByRole('button', { name: 'Install' }));
    expect(prompt).toHaveBeenCalled();
  });
});
