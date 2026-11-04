import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

const ocr = vi.hoisted(() => ({
  text: 'Pay Date: 11/06/2026\nTime Off   Accrued   Used   Available\nVacation  4.62  8.00  12.5 days\nSick  1.85  0.00  5 days',
  calls: 0,
  fail: false,
}));

vi.mock('./balanceOcr', () => ({
  recognizeImageText: vi.fn(async (_image: Blob, onProgress?: (p: { phase: 'loading' | 'reading'; progress: number }) => void) => {
    ocr.calls++;
    onProgress?.({ phase: 'loading', progress: 0.2 });
    onProgress?.({ phase: 'reading', progress: 0.7 });
    if (ocr.fail) throw new Error('boom');
    return ocr.text;
  }),
}));

import { Policy } from './Policy';
import { BalanceFromImage } from './BalanceFromImage';
import { valueInUnit } from './BalanceReader';

const INITIAL_SEARCH = '?c=US&cb=10&bao=2026-10-01&ak=pp&am=1&fq=m&pda=2026-10-15&cm=a&ace=0&fd=2027-01-15';
const created: string[] = [];
const revoked: string[] = [];

beforeEach(() => {
  ocr.calls = 0;
  ocr.fail = false;
  created.length = 0;
  revoked.length = 0;
  let n = 0;
  URL.createObjectURL = vi.fn(() => { const u = `blob:test/${++n}`; created.push(u); return u; });
  URL.revokeObjectURL = vi.fn((u: string) => { revoked.push(u); });
  window.localStorage.clear();
  window.history.replaceState(null, '', `/policy${INITIAL_SEARCH}`);
});
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/policy'); });

const quick = () => within(screen.getByRole('region', { name: 'Quick balance forecast' }));
const png = (bytes = 10) => new File([new Uint8Array(bytes)], 'payslip.png', { type: 'image/png' });

async function pickImage(file: File) {
  fireEvent.click(quick().getByRole('button', { name: 'Read it from a screenshot' }));
  const input = await quick().findByLabelText('Choose a screenshot');
  await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
}

describe('BalanceFromImage on the policy page', () => {
  it('pick image -> candidates -> tap -> balance and as-of date land in the URL', async () => {
    render(<Policy />);
    await pickImage(png());
    const choice = await screen.findByRole('button', { name: /Vacation available · 12\.5 days · as of Nov 6/ });
    expect(ocr.calls).toBe(1);
    // Sick leave is never offered.
    expect(screen.queryByRole('button', { name: /Sick/ })).toBeNull();
    // Nothing changed until the tap.
    expect(new URLSearchParams(window.location.search).get('cb')).toBe('10');
    fireEvent.click(choice);
    const params = new URLSearchParams(window.location.search);
    expect(params.get('cb')).toBe('12.5');
    expect(params.get('bao')).toBe('2026-11-06');
    expect((quick().getByLabelText('Current PTO balance (days)') as HTMLInputElement).value).toBe('12.5');
    expect((quick().getByLabelText('Balance as-of date') as HTMLInputElement).value).toBe('2026-11-06');
    expect(screen.getByText(/Balance set to 12\.5 days as of Nov 6, 2026/)).toBeTruthy();
  });

  it('converts an hours balance into the page unit', async () => {
    ocr.text = 'Vacation Balance 40.00 hrs';
    render(<Policy />);
    await pickImage(png());
    const choice = await screen.findByRole('button', { name: /Vacation balance · 40 hours \(5 days at 8 h\/day\)/ });
    fireEvent.click(choice);
    expect(new URLSearchParams(window.location.search).get('cb')).toBe('5');
    // No as-of date in the text: the as-of date is left alone.
    expect(new URLSearchParams(window.location.search).get('bao')).toBe('2026-10-01');
  });

  it('extracts live from pasted text without OCR', async () => {
    render(<Policy />);
    fireEvent.click(quick().getByRole('button', { name: 'Read it from a screenshot' }));
    fireEvent.click(await quick().findByRole('button', { name: 'Paste the text instead' }));
    fireEvent.change(quick().getByLabelText('Text from your payslip or HR page'), { target: { value: 'PTO remaining 7 days as of 10/31/2026' } });
    fireEvent.click(await screen.findByRole('button', { name: /PTO remaining · 7 days · as of Oct 31/ }));
    expect(ocr.calls).toBe(0);
    expect(new URLSearchParams(window.location.search).get('cb')).toBe('7');
    expect(new URLSearchParams(window.location.search).get('bao')).toBe('2026-10-31');
  });

  it('has no submit or generate button', async () => {
    render(<Policy />);
    fireEvent.click(quick().getByRole('button', { name: 'Read it from a screenshot' }));
    await quick().findByLabelText('Choose a screenshot');
    expect(quick().queryByRole('button', { name: /submit|generate|calculate|scan|apply/i })).toBeNull();
  });
});

describe('BalanceFromImage errors and cleanup', () => {
  const setup = async () => {
    const onUse = vi.fn();
    const recognize = vi.fn(async () => ocr.text);
    const view = render(<BalanceFromImage unit="days" hoursPerDay={8} today="2026-11-04" onUse={onUse} recognize={recognize} />);
    fireEvent.click(screen.getByRole('button', { name: 'Read it from a screenshot' }));
    await screen.findByLabelText('Choose a screenshot');
    return { onUse, recognize, view };
  };
  const choose = async (file: File) => {
    await act(async () => { fireEvent.change(screen.getByLabelText('Choose a screenshot'), { target: { files: [file] } }); });
  };

  it('rejects a file that is not an image', async () => {
    const { recognize } = await setup();
    await choose(new File(['hi'], 'notes.txt', { type: 'text/plain' }));
    expect(screen.getByText(/not an image/)).toBeTruthy();
    expect(recognize).not.toHaveBeenCalled();
  });

  it('rejects an image over 10 MB', async () => {
    const { recognize } = await setup();
    const big = png(1);
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 });
    await choose(big);
    expect(screen.getByText(/over 10 MB/)).toBeTruthy();
    expect(recognize).not.toHaveBeenCalled();
  });

  it('says calmly when no numbers are found', async () => {
    ocr.text = 'My time off\nRequests and history';
    await setup();
    await choose(png());
    expect(await screen.findByText(/No numbers were found/)).toBeTruthy();
  });

  it('says when only sick leave is found', async () => {
    ocr.text = 'Sick leave available 24 hours';
    await setup();
    await choose(png());
    expect(await screen.findByText(/Only sick or other leave/)).toBeTruthy();
  });

  it('handles an OCR failure', async () => {
    const onUse = vi.fn();
    render(<BalanceFromImage unit="days" hoursPerDay={8} today="2026-11-04" onUse={onUse} recognize={async () => { throw new Error('x'); }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Read it from a screenshot' }));
    await screen.findByLabelText('Choose a screenshot');
    await choose(png());
    expect(await screen.findByText(/could not be read on this device/)).toBeTruthy();
    expect(onUse).not.toHaveBeenCalled();
  });

  it('reads an image pasted from the clipboard', async () => {
    ocr.text = 'Vacation remaining 3 days';
    const { recognize, onUse } = await setup();
    const file = png();
    const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
    event.clipboardData = { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] };
    await act(async () => { document.dispatchEvent(event); });
    expect(recognize).toHaveBeenCalledWith(file, expect.any(Function));
    fireEvent.click(await screen.findByRole('button', { name: /Vacation remaining · 3 days/ }));
    expect(onUse).toHaveBeenCalledWith(3, undefined);
  });

  it('revokes the preview object URL on replace, remove and unmount, and stores nothing', async () => {
    ocr.text = 'Vacation remaining 3 days';
    // Earlier tests in the shared jsdom window may have left keys behind; this test is
    // about what the reader itself stores, so start from an empty store.
    window.localStorage.clear();
    window.sessionStorage.clear();
    const { view } = await setup();
    await choose(png());
    await choose(png());
    expect(revoked).toEqual([created[0]]);
    fireEvent.click(screen.getByRole('button', { name: 'Remove image' }));
    await waitFor(() => expect(revoked).toContain(created[1]));
    await choose(png());
    view.unmount();
    expect(revoked).toContain(created[2]);
    expect(window.localStorage.length).toBe(0);
  });

  it('valueInUnit converts both ways', () => {
    const c = { value: 2, unit: 'days' as const, unitStated: true, label: 'x', kind: 'vacation' as const, sourceLine: '', confidence: 1 };
    expect(valueInUnit(c, 'hours', 7.5)).toBe(15);
    expect(valueInUnit({ ...c, value: 10, unit: 'hours' }, 'days', 8)).toBe(1.25);
    expect(valueInUnit(c, 'days', 8)).toBe(2);
  });
});
