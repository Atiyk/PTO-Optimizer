import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EmailReminders, type AccountStatus } from './EmailReminders';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ON: AccountStatus = { features: { accounts: true, inbound: true }, inboundAddress: 'abc123@cloudmailin.net', account: null };

describe('EmailReminders', () => {
  it('renders nothing while accounts are not set up, so the signed-out app is unchanged', () => {
    const { container } = render(<EmailReminders kind="plan" search="b=20" enabled initialStatus={{ features: { accounts: false, inbound: false }, account: null }} />);
    expect(container.innerHTML).toBe('');
  });

  it('makes no request and renders nothing when this build has no accounts', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { container } = render(<EmailReminders kind="plan" search="b=20" enabled={false} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.innerHTML).toBe('');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the sign-in form without any request when nobody is signed in', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(<EmailReminders kind="plan" search="b=20" enabled />);
    expect(await screen.findByRole('button', { name: 'Email me a sign-in link' })).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('asks who is signed in only when the signed-in hint cookie exists', async () => {
    document.cookie = 'gapless_signed_in=1';
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...ON, account: { email: 'me@example.com', planLink: null, policyLink: null, reminders: false } })));
    vi.stubGlobal('fetch', fetchSpy);
    render(<EmailReminders kind="plan" search="b=20" enabled />);
    expect(await screen.findByText('me@example.com')).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    document.cookie = 'gapless_signed_in=; Max-Age=0';
  });

  it('offers an email sign-in link when signed out', () => {
    render(<EmailReminders kind="policy" search="c=US&cb=8" enabled initialStatus={ON} />);
    expect(screen.getByLabelText('Email address')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Email me a sign-in link' })).toBeTruthy();
    expect(screen.queryByText(/abc123@cloudmailin.net/)).toBeNull();
  });

  it('shows the reminder switch, the forwarding address and delete when signed in', () => {
    render(<EmailReminders kind="policy" search="c=US&cb=8" enabled initialStatus={{ ...ON, account: { email: 'me@example.com', planLink: null, policyLink: '/policy?c=US&cb=8', reminders: true } }} />);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/abc123@cloudmailin.net/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete my account' })).toBeTruthy();
    expect(screen.queryByText(/saved earlier/)).toBeNull();
  });

  it('says when emails follow an older saved link', () => {
    render(<EmailReminders kind="policy" search="c=US&cb=9" enabled initialStatus={{ ...ON, account: { email: 'me@example.com', planLink: null, policyLink: '/policy?c=US&cb=8', reminders: true } }} />);
    expect(screen.getByText(/saved earlier/)).toBeTruthy();
  });
});
