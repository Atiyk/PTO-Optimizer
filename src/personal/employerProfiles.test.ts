import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkWeek } from '@daysoff/engine/solver/types';
import { defaultEmployerCalendar, readEmployerCalendar, saveEmployerCalendar } from './employerCalendar';
import {
  EMPLOYER_PROFILES_STORAGE_KEY, MAX_EMPLOYER_PROFILES,
  decodeEmployerWorkProfiles, deleteEmployerWorkProfiles, encodeEmployerWorkProfiles,
  normalizeEmployerWorkProfile, readEmployerWorkProfiles, removeEmployerWorkProfile,
  resolveEmployerWorkProfile, saveEmployerWorkProfiles, upsertEmployerWorkProfile,
  type EmployerWorkProfile,
} from './employerProfiles';

const week = [true, true, true, true, true, false, false] as WorkWeek;
const fixture = (id = 'nyc'): EmployerWorkProfile => ({
  version: 1, id, name: 'My work calendar',
  calendar: { ...defaultEmployerCalendar('US', 'US-NY'), custom: [{ date: '2027-07-02', name: 'Office closed' }] },
  workWeek: week, altFridayEnabled: false, altFridayStart: null,
  blackoutDays: ['2027-03-01', '2027-03-02'], planningYearStart: { month: 4, day: 1 },
});

describe('named employer work profiles (consumer-only)', () => {
  beforeEach(() => localStorage.clear());

  it('round trips named calendar, country, holidays, workweek, blackouts and fiscal year', () => {
    const raw = encodeEmployerWorkProfiles([fixture()]);
    expect(decodeEmployerWorkProfiles(raw)).toEqual([fixture()]);
    expect(raw).not.toContain('salary');
  });

  it('supports multiple named profiles without mixing jurisdiction scopes', () => {
    const ca = { ...fixture('toronto'), name: 'Toronto', calendar: defaultEmployerCalendar('CA', 'CA-ON') };
    const all = upsertEmployerWorkProfile([fixture()], ca);
    expect(all?.map((p) => p.id)).toEqual(['nyc', 'toronto']);
    expect(all?.[1].calendar.country).toBe('CA');
    expect(removeEmployerWorkProfile(all!, 'nyc')?.map((p) => p.id)).toEqual(['toronto']);
  });

  it('updates an existing profile by stable id instead of duplicating it', () => {
    const next = upsertEmployerWorkProfile([fixture()], { ...fixture(), name: 'Renamed' });
    expect(next).toHaveLength(1);
    expect(next?.[0].name).toBe('Renamed');
  });

  it('deduplicates dates but does not infer school or employer closures', () => {
    const value = normalizeEmployerWorkProfile({
      ...fixture(), blackoutDays: ['2027-03-02', '2027-03-01', '2027-03-02'],
    });
    expect(value?.blackoutDays).toEqual(['2027-03-01', '2027-03-02']);
    expect(value?.calendar.custom).toHaveLength(1);
  });

  it('supports a valid alternating Friday anchor and rejects invalid anchors', () => {
    expect(normalizeEmployerWorkProfile({
      ...fixture(), altFridayEnabled: true, altFridayStart: '2027-02-26',
    })?.altFridayStart).toBe('2027-02-26');
    expect(normalizeEmployerWorkProfile({
      ...fixture(), altFridayEnabled: true, altFridayStart: null,
    })).toBeNull();
    expect(normalizeEmployerWorkProfile({
      ...fixture(), altFridayEnabled: false, altFridayStart: '2027-02-26',
    })).toBeNull();
  });

  it('rejects impossible dates, nonannual Feb 29 reset and empty workweeks', () => {
    expect(normalizeEmployerWorkProfile({ ...fixture(), blackoutDays: ['2027-02-29'] })).toBeNull();
    expect(normalizeEmployerWorkProfile({ ...fixture(), planningYearStart: { month: 2, day: 29 } })).toBeNull();
    expect(normalizeEmployerWorkProfile({ ...fixture(), workWeek: Array(7).fill(false) })).toBeNull();
    expect(normalizeEmployerWorkProfile({ ...fixture(), workWeek: Array(8).fill(true) })).toBeNull();
  });

  it('rejects unsafe names, malformed ids and duplicate profile ids', () => {
    expect(normalizeEmployerWorkProfile({ ...fixture(), name: 'HR\nprivate' })).toBeNull();
    expect(normalizeEmployerWorkProfile({ ...fixture(), id: '../other' })).toBeNull();
    expect(decodeEmployerWorkProfiles(JSON.stringify({ version: 1, profiles: [fixture(), fixture()] }))).toBeNull();
  });

  it('bounds collection size and rejects unknown versions and malicious JSON', () => {
    const tooMany = Array.from({ length: MAX_EMPLOYER_PROFILES + 1 }, (_, i) => fixture('p' + i));
    expect(encodeEmployerWorkProfiles(tooMany)).toBe('');
    expect(decodeEmployerWorkProfiles('{"version":2,"profiles":[]}')).toBeNull();
    expect(decodeEmployerWorkProfiles('not-json')).toBeNull();
    expect(decodeEmployerWorkProfiles('x'.repeat(65_000))).toBeNull();
  });

  it('saves, reads and deletes local named profiles without touching the legacy active calendar', () => {
    const legacy = { ...defaultEmployerCalendar('US', 'US-NY'), excluded: ['2027-12-24|Christmas Day'] };
    expect(saveEmployerCalendar(legacy)).toBe(true);
    expect(saveEmployerWorkProfiles([fixture()])).toBe(true);
    expect(readEmployerWorkProfiles()).toEqual([fixture()]);
    expect(readEmployerCalendar('US', 'US-NY')).toEqual(legacy);
    expect(localStorage.getItem(EMPLOYER_PROFILES_STORAGE_KEY)).toBeTruthy();
    expect(deleteEmployerWorkProfiles()).toBe(true);
    expect(readEmployerWorkProfiles()).toEqual([]);
    expect(readEmployerCalendar('US', 'US-NY')).toEqual(legacy);
  });

  it('fails safely when browser storage is unavailable', () => {
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(readEmployerWorkProfiles()).toEqual([]);
    read.mockRestore();
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(saveEmployerWorkProfiles([fixture()])).toBe(false);
    write.mockRestore();
    const remove = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(deleteEmployerWorkProfiles()).toBe(false);
    remove.mockRestore();
  });

  it('lets explicit URL-plan overrides take precedence without changing the saved profile', () => {
    const stored = fixture();
    const plan = resolveEmployerWorkProfile(stored, {
      calendar: { ...defaultEmployerCalendar('US', 'US-NY'), excluded: ['2027-12-24|Christmas Day'] },
      workWeek: [true, true, true, true, false, false, false] as WorkWeek,
      blackoutDays: ['2027-11-01'],
    });
    expect(plan?.overridden).toBe(true);
    expect(plan?.calendar.excluded).toEqual(['2027-12-24|Christmas Day']);
    expect(plan?.blackoutDays).toEqual(['2027-11-01']);
    expect(stored.calendar.excluded).toEqual([]);
    expect(stored.blackoutDays).toEqual(['2027-03-01', '2027-03-02']);
    expect(resolveEmployerWorkProfile(stored)?.overridden).toBe(false);
  });

  it('rejects a cross-jurisdiction override instead of leaking a different profile into the plan', () => {
    expect(resolveEmployerWorkProfile(fixture(), { calendar: defaultEmployerCalendar('GB') })).toBeNull();
    expect(resolveEmployerWorkProfile(fixture(), { blackoutDays: ['bad-date'] })).toBeNull();
    expect(resolveEmployerWorkProfile(fixture(), { altFridayEnabled: true })).toBeNull();
  });
});
