import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultEmployerCalendar, saveEmployerCalendar } from '../personal/employerCalendar';
import { savePolicyPreferences } from '../personal/policyPreferences';
import { decodePartnerAvailability } from '../planning/partner';
import { track } from './analytics';
import { decodeDateRanges, encodeDateRanges } from './familyUrlState';

const copied: string[] = [];
vi.mock('./analytics', () => ({ track: vi.fn() }));

vi.mock('./requestText', () => ({
  copyText: vi.fn(async (text: string) => { copied.push(text); return true; }),
}));

vi.mock('../personal/consumerHolidays', async (original) => ({
  ...await original<typeof import('../personal/consumerHolidays')>(),
  getConsumerHolidaysWithStatus: vi.fn(async () => ({ holidays: [], degraded: false })),
  getConsumerSubdivisionCandidates: vi.fn(async () => []),
}));

// Keep the small synthetic preset and also exercise a shipped district end to end.
vi.mock('../content/schoolDistricts', async original => {
  const real = await original<typeof import('../content/schoolDistricts')>();
  const nyc = real.findDistrictPreset('nyc-doe-2026-27')!;
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
    SCHOOL_DISTRICT_PRESETS: [preset, nyc],
    SCHOOL_PRESETS_AS_OF: '2026-11-01',
    findDistrictPreset: (id: string) => (id === preset.id ? preset : id === nyc.id ? nyc : undefined),
    presetOffDays: (p: typeof preset) => [...new Set(p.closures.flatMap((c) => weekdays(c.start, c.end)))].sort(),
    presetLabels: (p: typeof preset) => Object.fromEntries(p.closures.flatMap((c) => weekdays(c.start, c.end).map((d) => [d, c.label]))),
  };
});

const { Family } = await import('./Family');
const { FamilyConfirmList } = await import('./FamilyConfirmList');

const go = (query: string) => window.history.replaceState(null, '', `/family?${query}`);

beforeEach(() => { copied.length = 0; localStorage.clear(); vi.mocked(track).mockClear(); });
afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });

describe('Family planner', () => {
  it('uses the saved workweek, alternate Fridays and observed employer holidays locally', async () => {
    savePolicyPreferences('c=US&ww=0111110&afs=2026-11-20');
    saveEmployerCalendar({
      ...defaultEmployerCalendar('US'), custom: [{ date: '2026-11-17', name: 'Private company day' }],
    });
    const schoolDates = encodeDateRanges(['2026-11-16', '2026-11-17', '2026-11-20']);
    go(`c=US&s=2026-11-02&pto=0&sd=${schoolDates}`);
    render(<Family />);

    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('3 days with your kids without using PTO.'));
    expect(screen.getByText(/uses your saved work schedule/i)).toBeTruthy();
    expect(screen.getByText(/observed holiday: Private company day/)).toBeTruthy();
    expect(window.location.search).not.toMatch(/Private|ww=|afs=|eh=/i);

    const country = screen.getByRole('combobox', { name: 'Country' });
    fireEvent.focus(country);
    fireEvent.change(country, { target: { value: 'Canada' } });
    fireEvent.click(screen.getByRole('option', { name: 'Canada (CA)' }));
    expect(screen.getByText(/assumes you work Monday to Friday/i)).toBeTruthy();
    expect(screen.queryByText(/observed holiday: Private company day/)).toBeNull();
  });

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

  it('keeps break exclusions and district selection in this history entry across reloads', async () => {
    go('c=US&s=2026-11-02&d=test-district-2026-27&pto=3&token=remove-me');
    const view = render(<Family />);
    const toggle = screen.getByRole('switch', { name: /Include Winter recess/ }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    const params = new URLSearchParams(window.location.search);
    expect([...params.keys()]).toEqual(['c', 's', 'pto']);
    expect(params.get('pto')).toBe('3');
    const draft = new URLSearchParams(window.history.state.familyDraft);
    expect(draft.get('d')).toBe('test-district-2026-27');
    expect(draft.get('x')).toBeTruthy();
    view.unmount();
    render(<Family />);
    const restored = screen.getByRole<HTMLInputElement>('switch', { name: /Include Winter recess/ });
    expect(restored.checked).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Copy plan link' }));
    await waitFor(() => expect(copied).toHaveLength(1));
    expect([...new URL(copied[0]).searchParams.keys()]).toEqual(['c', 's', 'pto']);
    fireEvent.click(restored);
    expect(new URLSearchParams(window.history.state.familyDraft).has('x')).toBe(false);
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
    expect(link.searchParams.has('d')).toBe(false);
    expect(decodeDateRanges(link.searchParams.get('sd')!)).toContain('2026-11-26');
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

    const sd = new URLSearchParams(window.history.state.familyDraft).get('sd');
    expect(sd).toBeTruthy();
    expect(window.location.search).not.toMatch(/sd=|Emma|Maple|recess|picture/i);

    await waitFor(() => expect(screen.queryByText(/Updating observed holidays/)).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Share with family' }));
    const copy = screen.getByRole<HTMLButtonElement>('button', { name: 'Copy family link' });
    expect(copy.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /School closure dates/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Days I.m with the kids/ }));
    fireEvent.click(copy);
    await waitFor(() => expect(copied).toHaveLength(1));
    const link = new URL(copied[0]);
    expect(decodeURIComponent(copied[0])).not.toMatch(/Emma|Maple|recess|picture|Winter/i);
    expect(link.searchParams.get('sd')).toBe(sd);
    expect(decodePartnerAvailability(link.searchParams.get('pp')!)?.freeDays).toBeNull();
    expect([...link.searchParams.keys()].sort()).toEqual(['pp', 'sd']);
  });

  it('a received link with pp shows the other adult as childcare cover', () => {
    go('c=US&s=2026-11-02&d=test-district-2026-27&pto=0&pp=1:p:20261228~20261231:-');
    render(<Family />);
    expect(screen.getByRole('heading', { name: 'Another adult shared their days' })).toBeTruthy();
    expect(screen.getByText(/They could cover 4 school days off/)).toBeTruthy();
    expect(new URLSearchParams(window.location.search).has('pp')).toBe(false);
    expect(new URLSearchParams(window.history.state.familyDraft).get('pp')).toBe('1:p:20261228~20261231:-');
  });

  it('says when the other adult only shares days you already cover', () => {
    go('c=US&s=2026-11-02&d=test-district-2026-27&pto=60&pp=1:p:20261228~20261231:-');
    render(<Family />);
    expect(screen.getByText(/They don.t cover any of your remaining uncovered school days\. 4 of their days fall on school days off you already cover\./)).toBeTruthy();
  });

  it('separates actual district closures, added dates and proposed care in the uncovered list', async () => {
    const extraDate = encodeDateRanges(['2026-12-18']);
    go(`c=US&s=2026-11-02&d=nyc-doe-2026-27&pto=0&sd=${extraDate}&pp=1:p:20261228:-`);
    render(<Family />);
    const list = screen.getByRole('region', { name: 'Uncovered school days' });
    expect(within(list).getByText(/Dec 28, 2026/).parentElement?.textContent).toMatch(/NYC Public Schools · Other adult proposed/);
    expect(within(list).getByText(/Dec 18, 2026/).parentElement?.textContent).toMatch(/Added or shared dates/);
    expect(within(list).queryByText(/Nov 3, 2026/)).toBeNull();
    expect(screen.getByRole('link', { name: /NYC Public Schools.*School Year Calendar/ }).getAttribute('href')).toMatch(/^https:\/\/www\.schools\.nyc\.gov/);
    await waitFor(() => expect(screen.queryByText(/Updating observed holidays/)).toBeNull());
    expect(screen.queryByRole('button', { name: /confirmed care for these closures/ })).toBeNull();
    expect(track).toHaveBeenCalledWith('family_share_opened');
  });

  it('recomputes coverage live and confirms only the listed closures after user review', async () => {
    const school = encodeDateRanges(['2026-12-24', '2026-12-28', '2026-12-29']);
    go(`c=US&s=2026-11-02&pto=2&sd=${school}&pp=1:c:20261224:-`);
    const view = render(<Family />);
    const priority = screen.getByRole<HTMLInputElement>('checkbox', { name: 'Cover school days first' });
    expect(priority.checked).toBe(false);
    fireEvent.click(priority);
    expect(new URLSearchParams(window.location.search).get('cp')).toBe('1');
    await waitFor(() => expect(screen.queryByText(/Updating observed holidays/)).toBeNull());
    expect(track).toHaveBeenCalledWith('family_coverage_priority_changed');
    expect(track).not.toHaveBeenCalledWith('family_listed_coverage_confirmed');
    fireEvent.click(screen.getByRole('button', { name: /confirmed care for these closures/ }));
    expect(screen.getByText('Coverage confirmed for these listed closures.')).toBeTruthy();
    expect(track).toHaveBeenCalledWith('family_listed_coverage_confirmed');
    view.unmount();
    render(<Family />);
    expect(screen.getByRole<HTMLInputElement>('checkbox', { name: 'Cover school days first' }).checked).toBe(true);
  });

  it('copies a comparable saved balance into the family budget only on request', () => {
    savePolicyPreferences('c=US&u=1&cb=37&hpd=7.5&bao=2026-11-01');
    go('c=US&s=2026-11-02&pto=2');
    render(<Family />);
    const input = screen.getByRole<HTMLInputElement>('spinbutton', { name: 'PTO for school breaks' });
    expect(input.value).toBe('2');
    expect(screen.getByText(/4 whole days from My PTO/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Use my saved balance' }));
    expect(input.value).toBe('4');
    expect(new URLSearchParams(window.location.search).get('pto')).toBe('4');
    fireEvent.change(input, { target: { value: '3' } });
    expect(input.value).toBe('3');
    expect(screen.getByText(/4 whole days from My PTO/)).toBeTruthy();
  });

  it('flags unreadable school dates in a received link instead of dropping them silently', () => {
    go('s=2026-11-02&sd=garbage');
    render(<Family />);
    expect(screen.getByRole('alert').textContent).toMatch(/school dates in this link couldn.t be read/);
  });

  it('blocks a recurring school import without accepting its partial date list', async () => {
    go('c=US&s=2026-11-02');
    render(<Family />);
    const text = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261120', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261127', 'RRULE:FREQ=WEEKLY;COUNT=3', 'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const file = Object.assign(new File([text], 'school.ics'), { text: async () => text });
    fireEvent.change(screen.getByLabelText('Upload a school calendar file (.ics)'), { target: { files: [file] } });
    expect(await screen.findByText(/repeating events that cannot be imported completely/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add \d checked dates?/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Start with the school calendar' })).toBeTruthy();
    expect(new URLSearchParams(window.location.search).has('sd')).toBe(false);
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
