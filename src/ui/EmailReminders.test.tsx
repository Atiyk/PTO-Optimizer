import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { encodeEmployerCalendar } from '../personal/employerCalendar';
import { EmailReminders, type AccountStatus } from './EmailReminders';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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

describe('private employer calendar reminder consent', () => {
  const privateQuery = 'b=20&eh=' + encodeURIComponent(encodeEmployerCalendar({
    version: 1, country: 'US', excluded: [],
    custom: [{ date: '2027-12-27', name: 'PRIVATE_EMPLOYER_POLICY_TITLE' }],
  }));

  it('never sends a private return URL during sign-in until the user confirms disclosure', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ account: null }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<EmailReminders kind="plan" search={privateQuery} enabled initialStatus={ON} />);
    expect(screen.getByText(/private reminder link includes custom employer calendar names/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'owner@example.com' } });
    const form = screen.getByRole('button', { name: 'Email me a sign-in link' }).closest('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.submit(form!);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1].body));
    expect(body).toMatchObject({ action: 'login', email: 'owner@example.com' });
    expect(body.returnTo).toContain('eh=');
  });

  it('does not save a private plan reminder link after declined consent', async () => {
    const account = { email: 'owner@example.com', planLink: null, policyLink: null, reminders: false };
    const fetchSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ account }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<EmailReminders kind="plan" search={privateQuery} enabled initialStatus={{ ...ON, account }} />);
    const toggle = screen.getByRole('checkbox');
    fireEvent.click(toggle);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(toggle);
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1].body));
    expect(body).toMatchObject({ action: 'save', reminders: true });
    expect(body.planLink).toContain('eh=');
  });
});
