import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { createPtoRequest, parseRequestLedger, REQUEST_STORAGE_KEY, writeRequestLedger, type RequestCalendar } from '../personal/requestLedger';
import { PtoTracker } from './PtoTracker';
import { useRequestLedger } from './useRequestLedger';
import { ApprovalAssistant } from './ApprovalAssistant';
import { downloadOutOfOfficeICS } from './icsExport';

vi.mock('./icsExport', async (importOriginal) => ({ ...(await importOriginal<typeof import('./icsExport')>()), downloadOutOfOfficeICS: vi.fn() }));

const calendar: RequestCalendar = { workWeek: DEFAULT_WORK_WEEK, offDays: ['2026-12-25'], rangeStart: '2026-11-01', rangeEnd: '2027-12-31' };
const saved = () => parseRequestLedger(window.localStorage.getItem(REQUEST_STORAGE_KEY));
const paste = () => screen.getByLabelText(/Got a reply from your manager\?/) as HTMLTextAreaElement;

function Harness({ notice }: { notice?: number }) {
  const ledger = useRequestLedger();
  return <PtoTracker ledger={ledger} calendar={calendar} today="2026-11-04" noticePeriodDays={notice} />;
}

function seed() {
  writeRequestLedger([
    { ...createPtoRequest({ start: '2026-12-22', end: '2026-12-24', note: 'Winter break' }, calendar, 'winter', '2026-11-01T12:00:00.000Z')! },
    { ...createPtoRequest({ start: '2027-07-05', end: '2027-07-09', status: 'requested' }, calendar, 'july', '2026-11-01T12:00:00.000Z')! },
  ]);
}

beforeEach(() => { window.localStorage.clear(); seed(); });
afterEach(() => { cleanup(); window.localStorage.clear(); vi.clearAllMocks(); });

describe('ApprovalAssistant', () => {
  it('reads the paste live, with no parse button, and shows what it found with the evidence', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: /parse|submit|generate/i })).toBeNull();
    fireEvent.change(paste(), { target: { value: 'Approved, enjoy!\n\n> Can I take Dec 22–24 off?' } });
    expect(screen.getByText('Approved: Dec 22 – 24')).toBeTruthy();
    expect(screen.getByText(/Matches your planned request “Winter break” \(Dec 22 – 24\)/)).toBeTruthy();
    expect(screen.getByText('Approved, enjoy!')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Mark as/ })).toHaveLength(1);
    expect(saved().find((r) => r.id === 'winter')!.status).toBe('planned'); // nothing changes before confirm
  });

  it('confirm updates the status, clears the paste and offers the two follow-ups', async () => {
    const download = vi.mocked(downloadOutOfOfficeICS);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<Harness />);
    fireEvent.change(paste(), { target: { value: 'Subject: Time off request approved\nYour request for Dec 22 - Dec 24, 2026 has been approved.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Mark as approved' }));
    expect(saved().find((r) => r.id === 'winter')!.status).toBe('approved');
    expect(paste().value).toBe('');
    const heading = screen.getByRole('heading', { name: 'Marked as approved: Dec 22 – 24' });
    expect(document.activeElement).toBe(heading);
    fireEvent.click(screen.getByRole('button', { name: 'Add out-of-office to your calendar (.ics)' }));
    expect(download).toHaveBeenCalledWith({ requestId: 'winter', start: '2026-12-22', end: '2026-12-24', description: 'Back on Monday, December 28, 2026.' });
    const message = screen.getByLabelText('Out-of-office message') as HTMLTextAreaElement;
    expect(message.value).toContain('from Tuesday, December 22, 2026 through Thursday, December 24, 2026');
    fireEvent.change(message, { target: { value: message.value.replace('[your name]', 'Sam') } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy message' })); });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('\nSam'));
    expect(screen.getByText('Copied.')).toBeTruthy();
    expect(window.localStorage.getItem(REQUEST_STORAGE_KEY)).not.toContain('enjoy');
    expect(window.localStorage.getItem(REQUEST_STORAGE_KEY)).not.toContain('has been approved');
  });

  it('a denial confirms as rejected with no out-of-office follow-ups', () => {
    render(<Harness />);
    fireEvent.change(paste(), { target: { value: "Unfortunately we can't approve July 5-9." } });
    expect(screen.getByText('Not approved: Jul 5 – 9')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mark as rejected' }));
    expect(saved().find((r) => r.id === 'july')!.status).toBe('rejected');
    expect(screen.queryByRole('button', { name: /out-of-office/ })).toBeNull();
  });

  it('explains unclear and unmatched messages without a confirm action', () => {
    render(<Harness />);
    fireEvent.change(paste(), { target: { value: 'Let me check with HR and get back to you.' } });
    expect(screen.getByText('Couldn’t tell if this is an approval')).toBeTruthy();
    expect(screen.getByText(/still pending, or as a question/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Mark as/ })).toBeNull();
    fireEvent.change(paste(), { target: { value: 'Approved for Oct 1 - Oct 3' } });
    expect(screen.getByText(/None of your planned or requested dates overlap/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Mark as/ })).toBeNull();
    fireEvent.change(paste(), { target: { value: 'Sounds good!' } });
    expect(screen.getByText('Approved, but no dates found')).toBeTruthy();
    expect(screen.getByText(/Paste the whole thread/)).toBeTruthy();
  });

  it('flags ambiguous numeric dates before confirming', () => {
    render(<PtoTrackerWithLocale />);
    fireEvent.change(paste(), { target: { value: 'Approved: 07/05/2027 - 07/09/2027' } });
    expect(screen.getByText(/could be read day-first or month-first/)).toBeTruthy();
  });

  it('shows the submit-by date on planned requests only, from the notice period', () => {
    render(<Harness notice={14} />);
    expect(screen.getByText('Submit by Dec 8, 2026')).toBeTruthy();
    expect(screen.getAllByText(/Submit by/)).toHaveLength(1); // the requested one has none
    cleanup();
    render(<Harness />);
    expect(screen.getByText(/14-day notice/)).toBeTruthy();
  });
});

function PtoTrackerWithLocale() {
  const ledger = useRequestLedger();
  return <ApprovalAssistant ledger={ledger} calendar={calendar} today="2026-11-04" locale="en" />;
}
