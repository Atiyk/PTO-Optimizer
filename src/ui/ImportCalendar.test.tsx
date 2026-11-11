import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ImportCalendar } from './ImportCalendar';

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(onImportBusyDays = vi.fn(), planningWindow?: { start: string; end: string }) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<ImportCalendar onImportBusyDays={onImportBusyDays} planningWindow={planningWindow} />);
  });
  return { onImportBusyDays };
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

async function selectFile(content: string, name = 'calendar.ics') {
  const input = container!.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File([content], name, { type: 'text/calendar' });
  // jsdom's `files` is read-only on a real input; this is the standard workaround for
  // simulating a file picker selection in a test environment.
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
    // file.text() resolves asynchronously - let that microtask (and the resulting state
    // update) settle before the caller inspects the DOM.
    await Promise.resolve();
    await Promise.resolve();
  });
}

const VALID_ICS =
  'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261219\r\nDTEND;VALUE=DATE:20261228\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';

describe('ImportCalendar', () => {
  it('shows the "parsed in your browser" privacy line and the file input up front', () => {
    mount();
    expect(container!.textContent).toContain('Parsed in your browser. Nothing is uploaded.');
    expect(container!.querySelector('input[type="file"]')).not.toBeNull();
  });

  it('shows a preview with the day count and month range, not applying anything yet', async () => {
    const { onImportBusyDays } = mount();
    await selectFile(VALID_ICS);
    expect(container!.textContent).toContain('Found 9 busy days between Dec');
    expect(container!.textContent).toContain('add them?');
    expect(onImportBusyDays).not.toHaveBeenCalled();
  });

  it('lets users inspect exact blocked dates and explains time-zone handling before Add', async () => {
    const { onImportBusyDays } = mount();
    await selectFile(VALID_ICS);
    expect(container!.textContent).toContain('Review individual dates');
    expect(container!.textContent).toContain('2026-12-19');
    expect(container!.textContent).toContain('2026-12-27');
    expect(container!.textContent).toContain('unsupported or ambiguous time zones are rejected');
    expect(onImportBusyDays).not.toHaveBeenCalled();
  });

  it('only applies the import once the user clicks Add', async () => {
    const { onImportBusyDays } = mount();
    await selectFile(VALID_ICS);
    const addButton = [...container!.querySelectorAll('button')].find((b) => b.textContent === 'Add')!;
    act(() => addButton.click());
    expect(onImportBusyDays).toHaveBeenCalledOnce();
    const dates = onImportBusyDays.mock.calls[0][0] as string[];
    expect(dates).toHaveLength(9);
    expect(dates[0]).toBe('2026-12-19');
  });

  it('Cancel discards the preview without calling onImportBusyDays', async () => {
    const { onImportBusyDays } = mount();
    await selectFile(VALID_ICS);
    const cancelButton = [...container!.querySelectorAll('button')].find((b) => b.textContent === 'Cancel')!;
    act(() => cancelButton.click());
    expect(onImportBusyDays).not.toHaveBeenCalled();
    expect(container!.textContent).not.toContain('add them?');
  });

  it('shows a clear error, never a crash, for a non-.ics file', async () => {
    const { onImportBusyDays } = mount();
    await selectFile('just some random text, not a calendar', 'notes.txt');
    expect(container!.textContent).toContain("doesn't look like a calendar");
    expect(onImportBusyDays).not.toHaveBeenCalled();
  });

  it('rejects oversized ICS files before reading them and never imports private dates', async () => {
    const { onImportBusyDays } = mount();
    await selectFile('X'.repeat(1_000_001));
    expect(container!.textContent).toContain('too large to import safely');
    expect(onImportBusyDays).not.toHaveBeenCalled();
  });

  it('shows a clear message when the file is a valid calendar but has nothing importable', async () => {
    mount();
    const emptyIcs = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
    await selectFile(emptyIcs);
    expect(container!.textContent).toContain('No all-day or multi-day events found');
  });

  it('expands a repeating all-day event across the planning window', async () => {
    const { onImportBusyDays } = mount(vi.fn(), { start: '2026-09-01', end: '2026-09-30' });
    await selectFile(ics(['DTSTART;VALUE=DATE:20260907', 'RRULE:FREQ=WEEKLY']));
    expect(container!.textContent).toContain('Found 4 busy days');
    expect(container!.textContent).not.toContain('Import incomplete');
    act(() => [...container!.querySelectorAll('button')].find((b) => b.textContent === 'Add')!.click());
    expect(onImportBusyDays).toHaveBeenCalledWith(['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28']);
  });

  it('says plainly that the import is incomplete when a repeating pattern is unsupported', async () => {
    mount(vi.fn(), { start: '2026-09-01', end: '2027-06-30' });
    await selectFile(ics(
      ['DTSTART;VALUE=DATE:20261123', 'DTEND;VALUE=DATE:20261125'],
      ['DTSTART;VALUE=DATE:20260907', 'RRULE:FREQ=MONTHLY;BYDAY=MO;BYSETPOS=1'],
    ));
    expect(container!.textContent).toContain('Found 2 busy days');
    expect(container!.textContent).toContain('Import incomplete: 1 repeating event is not included (uses BYSETPOS). Add those dates by hand.');
  });

  it('shows the incomplete-import message, not "nothing found", when only unsupported repeats exist', async () => {
    mount(vi.fn(), { start: '2026-09-01', end: '2027-06-30' });
    await selectFile(ics(['DTSTART;VALUE=DATE:20260907', 'RRULE:FREQ=YEARLY;BYWEEKNO=20']));
    expect(container!.textContent).toContain('Import incomplete: 1 repeating event is not included (uses BYWEEKNO).');
    expect(container!.textContent).not.toContain('No all-day or multi-day events found');
  });
});

function ics(...events: string[][]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', ...events.flatMap(lines => ['BEGIN:VEVENT', ...lines, 'END:VEVENT']), 'END:VCALENDAR', ''].join('\r\n');
}
