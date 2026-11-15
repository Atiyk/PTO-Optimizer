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
    expect(choosePrimaryAction({ kept: false, roomToKeep: false, trackedRequests: 0, hasUnrequestedBreak: true })).toBe('calendar');
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
  });
});
