import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { rawHolidaysToHolidays } from '@daysoff/engine/data/holidays';
import { PLANNER_REVISION } from '@daysoff/engine/solver/revision';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import { createPtoRequest } from '../personal/requestLedger';
import { defaultEmployerCalendar, saveEmployerCalendar } from '../personal/employerCalendar';
import { useAppState } from '../ui/useAppState';
import { buildPublicPlanLink } from '../ui/publicSharePrivacy';
import { PLAN_SHARE_KEYS } from '../ui/shareFormat';
import us2027 from '../../public/holidays/US-2027.json';
import us2028 from '../../public/holidays/US-2028.json';

// Issue 9: a recipient opening a shared plan sees the sender's ranked breaks, and the
// link carries nothing private. These run the real planner hook on both ends.
const preload = rawHolidaysToHolidays([...us2027, ...us2028]);
const SCENARIO = '/pto?c=US&s=2027-01-01&e=2027-12-31&b=10&rv=0';
const PRIVATE_NAME = 'PRIVATE Acme founders day';

function breaksOf(state: ReturnType<typeof useAppState>): string[] {
  return state.breaks.map(brk => `${brk.start}..${brk.end}`);
}

function open(href: string, ...args: Parameters<typeof useAppState>) {
  window.history.replaceState(null, '', href);
  return renderHook(() => useAppState(...args));
}

function senderLink(...args: Parameters<typeof useAppState>): { url: string; breaks: string[] } {
  const sender = open(SCENARIO, ...args);
  try {
    const state = sender.result.current;
    expect(state.holidaysReady).toBe(true);
    const url = buildPublicPlanLink('https://gapless.example/pto', state.planSearch, undefined, state.shareSnapshot).url;
    return { url, breaks: breaksOf(state) };
  } finally { sender.unmount(); }
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })));
  window.__PTO_PRELOADED_HOLIDAYS__ = { US: preload };
  window.__PTO_PRELOADED_HOLIDAY_YEARS__ = { US: [2027, 2028] };
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete window.__PTO_PRELOADED_HOLIDAYS__;
  delete window.__PTO_PRELOADED_HOLIDAY_YEARS__;
  localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('shared plan snapshots reproduce the sender\'s plan', () => {
  it('shows the sender\'s breaks even when the recipient saved their own employer calendar', () => {
    const { url, breaks } = senderLink();
    // The recipient's own company calendar is their private data, not the sender's.
    saveEmployerCalendar({ ...defaultEmployerCalendar('US'), custom: [{ date: '2027-05-28', name: PRIVATE_NAME }], excluded: ['2027-11-25|Thanksgiving Day', '2027-09-06|Labor Day'] });
    const recipient = open(new URL(url).pathname + new URL(url).search);
    try {
      expect(breaksOf(recipient.result.current)).toEqual(breaks);
      expect(recipient.result.current.holidayNameFor('2027-05-28')).toBeUndefined();
      expect(recipient.result.current.sharedPlanDifferences).toEqual({ planner: false, holidays: false });
      expect(recipient.result.current.hasSavedCalendarOffForSharedPlan).toBe(true);
    } finally { recipient.unmount(); }
  });

  it('carries only allowlisted, non-identifying snapshot fields, unchanged by the sender\'s private data', () => {
    const plain = senderLink();
    saveEmployerCalendar({ ...defaultEmployerCalendar('US'), custom: [{ date: '2027-05-28', name: PRIVATE_NAME }] });
    const request = createPtoRequest({ start: '2027-07-06', end: '2027-07-07', status: 'approved', note: 'PRIVATE note' },
      { workWeek: DEFAULT_WORK_WEEK, offDays: [] }, 'booking')!;
    const customized = senderLink([request], '2027-01-01');
    const params = new URL(customized.url).searchParams;
    expect([...params.keys()].filter(key => !(PLAN_SHARE_KEYS as readonly string[]).includes(key))).toEqual([]);
    expect(params.get('er')).toBe(String(PLANNER_REVISION));
    expect(params.get('hf')).toMatch(/^[0-9a-f]{8}$/);
    // The fingerprint covers public holiday data only: the private calendar does not move it.
    expect(params.get('hf')).toBe(new URL(plain.url).searchParams.get('hf'));
    expect(customized.url).not.toMatch(/PRIVATE|Acme|2027-05-28|2027-07-0[67]/);
  });

  it('tells the recipient when the link was made by an earlier planner version', () => {
    const { url } = senderLink();
    const old = new URL(url);
    old.searchParams.delete('er'); // a version-1 link from before planner revisions were recorded
    const recipient = open(old.pathname + old.search);
    try {
      expect(recipient.result.current.sharedPlanDifferences).toEqual({ planner: true, holidays: false });
    } finally { recipient.unmount(); }
  });

  it('tells the recipient when their holiday data differs from the sender\'s', () => {
    const { url } = senderLink();
    // The recipient's build has one fewer public holiday than the sender's did.
    window.__PTO_PRELOADED_HOLIDAYS__ = { US: preload.filter(holiday => holiday.date !== '2027-11-11') };
    const recipient = open(new URL(url).pathname + new URL(url).search);
    try {
      expect(recipient.result.current.sharedPlanDifferences).toEqual({ planner: false, holidays: true });
    } finally { recipient.unmount(); }
  });

  it('does not flag an own (non-shared) plan', () => {
    const own = open(SCENARIO);
    try {
      expect(own.result.current.sharedPlanDifferences).toBeUndefined();
    } finally { own.unmount(); }
  });
});
