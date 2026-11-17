import { describe, expect, it } from 'vitest';
import { choosePrimaryAction, isPlanKept } from './primaryAction';

const current = {
  country: 'US', rangeStart: '2026-11-14', rangeEnd: '2027-11-13',
  breaks: [{ start: '2027-01-16', end: '2027-01-24', ptoDates: ['2027-01-19', '2027-01-20'] }],
};

describe('choosePrimaryAction', () => {
  it('offers Keep this plan when nothing is kept', () => {
    expect(choosePrimaryAction({ kept: false, roomToKeep: true, trackedRequests: 0, hasUnrequestedBreak: true })).toBe('keep');
  });
  it('offers Add to calendar once the plan is kept, or when there is no room to keep another', () => {
    expect(choosePrimaryAction({ kept: true, roomToKeep: true, trackedRequests: 0, hasUnrequestedBreak: true })).toBe('calendar');
    expect(choosePrimaryAction({ kept: false, roomToKeep: false, trackedRequests: 0, hasUnrequestedBreak: true })).toBe('manage');
  });
  it('offers Copy request after a tracked request while a break is still to ask for', () => {
    expect(choosePrimaryAction({ kept: true, roomToKeep: true, trackedRequests: 1, hasUnrequestedBreak: true })).toBe('copy-request');
    expect(choosePrimaryAction({ kept: true, roomToKeep: true, trackedRequests: 1, hasUnrequestedBreak: false })).toBe('calendar');
  });
});

describe('isPlanKept', () => {
  it('matches a kept plan with the same breaks and PTO dates only', () => {
    expect(isPlanKept([{ ...current }], current)).toBe(true);
    expect(isPlanKept([{ ...current, rangeEnd: '2027-12-31' }], current)).toBe(false);
    expect(isPlanKept([{ ...current, breaks: [{ ...current.breaks[0], ptoDates: ['2027-01-19'] }] }], current)).toBe(false);
    expect(isPlanKept([{ ...current, breaks: undefined }], current)).toBe(false);
    expect(isPlanKept([], current)).toBe(false);
    expect(isPlanKept([{ ...current, breaks: [{ start: current.breaks[0].start, end: current.breaks[0].end }] }], current)).toBe(false);
  });
  it('does not confuse identical breaks with different policy or PTO inputs', () => {
    const previous = { ...current, budget: 10, planningStyle: 'year' as const,
      employerCalendar: { version: 1 as const, country: 'US', excluded: [], custom: [] } };
    expect(isPlanKept([previous], previous)).toBe(true);
    expect(isPlanKept([previous], { ...previous, budget: 15 })).toBe(false);
    expect(isPlanKept([previous], { ...previous, planningStyle: 'balanced' })).toBe(false);
    expect(isPlanKept([previous], { ...previous, employerCalendar: {
      ...previous.employerCalendar, custom: [{ date: '2027-01-18', name: 'Company day off' }],
    } })).toBe(false);
    expect(isPlanKept([previous], { ...previous, reserveDays: 2 })).toBe(false);
    const withTwoRules = { ...previous, employerCalendar: {
      ...previous.employerCalendar,
      excluded: ['2027-01-19|Second holiday', '2027-01-18|First holiday'],
    } };
    const reversed = { ...withTwoRules, employerCalendar: {
      ...withTwoRules.employerCalendar, excluded: [...withTwoRules.employerCalendar.excluded].reverse(),
    } };
    expect(isPlanKept([withTwoRules], reversed)).toBe(true);
  });
});
