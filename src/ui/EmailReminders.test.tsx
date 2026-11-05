import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EmailReminders, type AccountStatus } from './EmailReminders';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ON: AccountStatus = { features: { accounts: true, inbound: true }, inboundAddress: 'abc123@cloudmailin.net', account: null };

describe('EmailReminders', () => {
  it('renders nothing while accounts are not set up, so the signed-out app is unchanged', () => {
    const { container } = render(<EmailReminders kind="plan" search="b=20" initialStatus={{ features: { accounts: false, inbound: false }, account: null }} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when the status request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { container } = render(<EmailReminders kind="plan" search="b=20" />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.innerHTML).toBe('');
  });

  it('offers an email sign-in link when signed out', () => {
    render(<EmailReminders kind="policy" search="c=US&cb=8" initialStatus={ON} />);
    expect(screen.getByLabelText('Email address')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Email me a sign-in link' })).toBeTruthy();
    expect(screen.queryByText(/abc123@cloudmailin.net/)).toBeNull();
  });

  it('shows the reminder switch, the forwarding address and delete when signed in', () => {
    render(<EmailReminders kind="policy" search="c=US&cb=8" initialStatus={{ ...ON, account: { email: 'me@example.com', planLink: null, policyLink: '/policy?c=US&cb=8', reminders: true } }} />);
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/abc123@cloudmailin.net/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete my account' })).toBeTruthy();
    expect(screen.queryByText(/saved earlier/)).toBeNull();
  });

  it('says when emails follow an older saved link', () => {
    render(<EmailReminders kind="policy" search="c=US&cb=9" initialStatus={{ ...ON, account: { email: 'me@example.com', planLink: null, policyLink: '/policy?c=US&cb=8', reminders: true } }} />);
    expect(screen.getByText(/saved earlier/)).toBeTruthy();
  });
});
