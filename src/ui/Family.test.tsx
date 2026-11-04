import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const copied: string[] = [];

vi.mock('./requestText', () => ({
  copyText: vi.fn(async (text: string) => { copied.push(text); return true; }),
}));

vi.mock('../personal/consumerHolidays', () => ({
  getConsumerHolidaysWithStatus: vi.fn(async () => ({ holidays: [], degraded: false })),
}));

// A fixed, small preset so the plan is deterministic regardless of the shipped data.
vi.mock('../content/schoolDistricts', () => {
  const preset = {
    id: 'test-district-2026-27',
    district: 'Test City Public Schools',
    shortName: 'Test City Schools',
    city: 'Test City',
    state: 'NY',
    schoolYear: '2026-27',
    firstDay: '2026-09-10',
    lastDay: '2027-06-25',
    closures: [
      { start: '2026-11-26', end: '2026-11-27', label: 'Thanksgiving recess', kind: 'break' },
      { start: '2026-12-24', end: '2027-01-01', label: 'Winter recess', kind: 'break' },
      { start: '2027-02-15', end: '2027-02-19', label: 'Midwinter recess', kind: 'break' },
    ],
    source: { url: 'https://example.org/calendar', title: 'Official calendar', retrieved: '2026-11-01' },
  };
  const weekdays = (start: string, end: string) => {
    const out: string[] = [];
    for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86400000) {
      const d = new Date(t);
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
    }
    return out;
  };
  return {
    SCHOOL_DISTRICT_PRESETS: [preset],
    SCHOOL_PRESETS_AS_OF: '2026-11-01',
    findDistrictPreset: (id: string) => (id === preset.id ? preset : undefined),
    presetOffDays: (p: typeof preset) => [...new Set(p.closures.flatMap((c) => weekdays(c.start, c.end)))].sort(),
    presetLabels: (p: typeof preset) => Object.fromEntries(p.closures.flatMap((c) => weekdays(c.start, c.end).map((d) => [d, c.label]))),
  };
});

const { Family } = await import('./Family');
const { FamilyConfirmList } = await import('./FamilyConfirmList');

const go = (query: string) => window.history.replaceState(null, '', `/family?${query}`);

beforeEach(() => { copied.length = 0; });
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('Family planner', () => {
  it('renders a live plan from a district preset, with its source and the coverage caveat', () => {
    go('c=US&s=2026-11-02&d=test-district-2026-27&pto=10');
    render(<Family />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/\d+ days with your kids/);
    expect(screen.getByText('Winter recess', { selector: 'p' })).toBeTruthy();
    expect(screen.getByText('Midwinter recess', { selector: 'p' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Official calendar' }).getAttribute('href')).toBe('https://example.org/calendar');
    expect(screen.getAllByText(/not a directory of every district/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Uncovered school days' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\bno gaps\b(?! (?:were )?found in the dates you added)/i);
    // No planning submit: nothing on the page is a submit button or a Generate action.
    expect(document.querySelector('button[type="submit"]')).toBeNull();
    expect(screen.queryByRole('button', { name: /generate|calculate|submit/i })).toBeNull();
  });

  it('says when the planning window runs past the preset school year', () => {
    go('c=US&s=2026-11-02&d=test-district-2026-27');
    render(<Family />);
    expect(screen.getByText(/preset covers the 2026-27 school year/)).toBeTruthy();
    expect(screen.getByText(/include the weekends that join each break/)).toBeTruthy();
  });

  it('switching a break off writes it to the URL and spends the PTO elsewhere', () => {
    go('c=US&s=2026-11-02&d=test-district-2026-27&pto=3');
    render(<Family />);
    const toggle = screen.getByRole('switch', { name: /Include Winter recess/ }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    const params = new URLSearchParams(window.location.search);
    expect(params.get('x')).toBeTruthy();
    expect(params.get('pto')).toBe('3');
    expect(params.get('d')).toBe('test-district-2026-27');
    fireEvent.click(toggle);
    expect(new URLSearchParams(window.location.search).get('x')).toBeNull();
  });

  it('shows the ask=1 banner and copies a link with the dates and without the request flag', async () => {
    go('c=US&ask=1');
    render(<Family />);
    expect(screen.getByRole('heading', { name: 'Someone asked you to add the school calendar' })).toBeTruthy();
    const send = screen.getByRole('button', { name: 'Copy link with these dates' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Test City Schools/ }));
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() => expect(copied).toHaveLength(1));
    const link = new URL(copied[0]);
    expect(link.pathname).toBe('/family');
    expect(link.searchParams.get('d')).toBe('test-district-2026-27');
    expect(link.searchParams.has('ask')).toBe(false);
    expect(link.searchParams.has('pto')).toBe(false);
    // Dates only: the helper's country never rides along.
    expect(link.searchParams.has('c')).toBe(false);
  });

  it('adds only confirmed pasted dates, and the family share link carries dates but no snippets', async () => {
    go('c=US&s=2026-11-02');
    render(<Family />);
    fireEvent.change(screen.getByLabelText('School calendar text'), {
      target: { value: 'Winter recess for Emma: Dec 21 - Jan 1\nMaple Elementary picture day Mar 3' },
    });
    const list = screen.getByRole('group', { name: /Found 2 dates in the text/ });
    const boxes = within(list).getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([true, false]);
    fireEvent.click(within(list).getByRole('button', { name: 'Add 1 checked date' }));

    const sd = new URLSearchParams(window.location.search).get('sd');
    expect(sd).toBeTruthy();
    expect(window.location.search).not.toMatch(/Emma|Maple|recess|picture/i);

    fireEvent.click(screen.getByRole('button', { name: 'Share with family' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Days I.m with the kids/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy family link' }));
    await waitFor(() => expect(copied).toHaveLength(1));
    const link = new URL(copied[0]);
    expect(decodeURIComponent(copied[0])).not.toMatch(/Emma|Maple|recess|picture|Winter/i);
    expect(link.searchParams.get('sd')).toBe(sd);
    expect(link.searchParams.get('pp')).toBeTruthy();
    expect([...link.searchParams.keys()].sort()).toEqual(['pp', 'sd']);
  });

  it('a received link with pp shows the other adult as childcare cover', () => {
    go('c=US&s=2026-11-02&d=test-district-2026-27&pto=0&pp=1:p:20261228~20261231:-');
    render(<Family />);
    expect(screen.getByRole('heading', { name: 'Another adult shared their days' })).toBeTruthy();
    expect(screen.getByText(/They cover 4 school days off/)).toBeTruthy();
  });

  it('says when the other adult only shares days you already cover', () => {
    go('c=US&s=2026-11-02&d=test-district-2026-27&pto=60&pp=1:p:20261228~20261231:-');
    render(<Family />);
    expect(screen.getByText(/They don.t cover any of your remaining uncovered school days\. 4 of their days fall on school days off you already cover\./)).toBeTruthy();
  });

  it('flags unreadable school dates in a received link instead of dropping them silently', () => {
    go('s=2026-11-02&sd=garbage');
    render(<Family />);
    expect(screen.getByRole('alert').textContent).toMatch(/school dates in this link couldn.t be read/);
  });
});

describe('FamilyConfirmList', () => {
  it('pre-checks likely closures, leaves unsure ones unchecked, and adds only checked dates', () => {
    const onAdd = vi.fn();
    render(
      <FamilyConfirmList
        heading="Found 3 dates"
        candidates={[
          { id: 'a', start: '2026-12-21', end: '2026-12-23', confidence: 'likely-closure', snippet: 'Winter recess Dec 21-23' },
          { id: 'b', start: '2027-03-03', end: '2027-03-03', confidence: 'unsure', snippet: 'Picture day Mar 3' },
          { id: 'c', start: '2027-04-05', end: '2027-04-05', confidence: 'likely-closure', snippet: 'No school Apr 5' },
        ]}
        onAdd={onAdd}
        onDiscard={() => {}}
      />,
    );
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([true, false, true]);
    fireEvent.click(boxes[2]);
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 checked date' }));
    expect(onAdd).toHaveBeenCalledWith(['2026-12-21', '2026-12-22', '2026-12-23']);
  });
});
