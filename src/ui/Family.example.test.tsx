import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeDateRanges } from './familyUrlState';
import { encodePartnerAvailability } from '../planning/partner';

// Unlike Family.test.tsx, this file uses the real shipped district presets, so the
// first-visit example is the real Fairfax County preset.
vi.mock('./analytics', () => ({ track: vi.fn() }));
vi.mock('./requestText', () => ({ copyText: vi.fn(async () => true) }));
vi.mock('./familyOcr', () => ({ readImageText: vi.fn(async () => 'Field trip permission slip\nBring a lunch') }));
vi.mock('../personal/consumerHolidays', async (original) => ({
  ...await original<typeof import('../personal/consumerHolidays')>(),
  getConsumerHolidaysWithStatus: vi.fn(async () => ({ holidays: [], degraded: false })),
  getConsumerSubdivisionCandidates: vi.fn(async () => []),
}));

const { Family } = await import('./Family');

const go = (query: string) => window.history.replaceState(null, '', `/family?${query}`);
const EXAMPLE = 'Example: Fairfax County Public Schools 2026–27';

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('Family first-visit example (F08)', () => {
  it('shows a live, labelled example plan on a bare US visit and keeps it out of the URL', () => {
    go('c=US&s=2026-11-14');
    render(<Family />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Line up your PTO with school breaks');
    const example = screen.getByRole('region', { name: EXAMPLE });
    expect(example.textContent).toMatch(/\d+ days with the kids for \d+ PTO days?\./);
    expect(example.textContent).toMatch(/This isn.t your calendar yet/);
    expect(screen.getByRole('heading', { name: 'School breaks (example)' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'On the calendar (example)' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Uncovered school days (example)' })).toBeTruthy();
    // No export or share output is offered for the example.
    expect(screen.queryByRole('button', { name: /Add my PTO to calendar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy plan link' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Share with family' })).toBeNull();
    expect(screen.queryByRole('button', { name: /I.ve confirmed care/ })).toBeNull();
    // Nothing about the example is written: a shared /family link reproduces it from c alone.
    const params = new URLSearchParams(window.location.search);
    expect(params.has('d')).toBe(false);
    expect(String(window.history.state?.familyDraft ?? '')).not.toMatch(/(^|&)d=/);
    expect(screen.getByText(/shown as the example/)).toBeTruthy();
  });

  it('puts the district search one tap away', () => {
    go('c=US&s=2026-11-14');
    render(<Family />);
    fireEvent.click(within(screen.getByRole('region', { name: EXAMPLE })).getByRole('button', { name: 'Pick your district' }));
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'School district' }));
  });

  it('drops the example label as soon as the person picks a district, without carrying switched-off breaks', async () => {
    go('c=US&s=2026-11-14');
    render(<Family />);
    const firstSwitch = screen.getAllByRole('switch')[0] as HTMLInputElement;
    fireEvent.click(firstSwitch);
    expect((screen.getAllByRole('switch')[0] as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole('radio', { name: /^Fairfax County/ }));
    await waitFor(() => expect(screen.queryByRole('region', { name: EXAMPLE })).toBeNull());
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/days with your kids/);
    expect(screen.getByRole('heading', { name: 'School breaks' })).toBeTruthy();
    expect((screen.getAllByRole('switch') as HTMLInputElement[]).every((s) => s.checked)).toBe(true);
    expect(screen.getByRole('button', { name: 'Copy plan link' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Share with family' })).toBeTruthy();
  });

  it('drops the example once the person adds their own dates', async () => {
    go(`c=US&s=2026-11-02&sd=${encodeDateRanges(['2026-11-16', '2026-11-17'])}`);
    render(<Family />);
    expect(screen.queryByRole('region', { name: EXAMPLE })).toBeNull();
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/with your kids/));
  });

  it('never shows the example next to shared availability', () => {
    const pp = encodePartnerAvailability({ days: ['2026-12-21', '2026-12-22'], freeDays: null, status: 'proposed' });
    go(`c=US&s=2026-11-14&pp=${encodeURIComponent(pp)}`);
    render(<Family />);
    expect(screen.queryByRole('region', { name: EXAMPLE })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Start with the school calendar' })).toBeTruthy();
  });

  it('outside the US leads with pasted or typed dates and says presets are US only', () => {
    go('c=GB&s=2026-11-14');
    render(<Family />);
    expect(screen.queryByRole('region', { name: EXAMPLE })).toBeNull();
    expect(screen.getByText(/District presets cover 12 large US school districts only/)).toBeTruthy();
    const paste = document.getElementById('family-source-paste') as HTMLDetailsElement;
    expect(paste.open).toBe(true);
    const order = ['family-source-paste', 'family-source-type', 'family-source-ics'].map((id) => document.getElementById(id)!);
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // US presets stay available, one level down.
    expect((document.getElementById('family-us-presets') as HTMLDetailsElement).open).toBe(false);
    fireEvent.click(within(screen.getByRole('region', { name: 'Start with the school calendar' })).getByRole('button', { name: 'Type dates' }));
    expect((document.getElementById('family-source-type') as HTMLDetailsElement).open).toBe(true);
  });
});

describe('Family empty, zero and error states', () => {
  it('explains a plan with 0 PTO and points at the PTO field', () => {
    go('c=US&s=2026-11-14&pto=0');
    render(<Family />);
    expect(screen.getByText(/PTO for school breaks is 0, so this plan only counts days you.re already off/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Change PTO days' }));
    expect(document.activeElement).toBe(screen.getByLabelText('PTO for school breaks'));
  });

  it('says where the added dates fall when none are in the planning window', () => {
    go(`c=US&s=2026-11-02&sd=${encodeDateRanges(['2025-12-22', '2025-12-23'])}`);
    render(<Family />);
    const empty = screen.getByRole('region', { name: 'No school breaks in this window' });
    expect(empty.textContent).toMatch(/Your school dates run from Dec 22, 2025 to Dec 23, 2025/);
    fireEvent.click(within(empty).getByRole('button', { name: 'Change the start date' }));
    expect(document.activeElement).toBe(screen.getByLabelText('Plan from'));
  });

  it('when a photo has no dates, says how to retake it and offers paste or type instead', async () => {
    go('c=US&s=2026-11-14');
    render(<Family />);
    const file = new File(['x'], 'calendar.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Choose a photo or screenshot of the school calendar'), { target: { files: [file] } });
    expect(await screen.findByText(/No dates found in this photo\. Retake it straight on/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Paste text instead' }));
    expect((document.getElementById('family-source-paste') as HTMLDetailsElement).open).toBe(true);
    expect(document.activeElement).toBe(screen.getByLabelText('School calendar text'));
  });
});
