import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultEmployerCalendar, freshEmployerCalendar, encodeEmployerCalendar, decodeEmployerCalendar, readEmployerCalendar, saveEmployerCalendar, deleteEmployerCalendar, validCalendarDate, writeEmployerCalendar, EMPLOYER_STORAGE_PREFIX, upgradeEmployerCalendar, employerCalendarCustomized, hasStoredEmployerCalendar } from './employerCalendar';

describe('employer calendar storage and shared state', () => {
  beforeEach(() => localStorage.clear());
  it('saves exclusions and Unicode company holidays without crossing country or region', () => {
    const calendar = { ...defaultEmployerCalendar('US', 'US-NY'), excluded: ['2027-12-24|Christmas Day'], custom: [{ date: '2027-07-02', name: 'Company été' }] };
    expect(saveEmployerCalendar(calendar)).toBe(true);
    expect(readEmployerCalendar('US', 'US-NY')).toEqual(calendar);
    expect(readEmployerCalendar('US').excluded).toEqual([]);
    expect(readEmployerCalendar('GB').custom).toEqual([]);
    expect(deleteEmployerCalendar('US', 'US-NY')).toBe(true);
    expect(readEmployerCalendar('US', 'US-NY').excluded).toEqual([]);
  });
  it('round trips an explicit public default and rejects malformed or huge payloads', () => {
    expect(decodeEmployerCalendar(encodeEmployerCalendar(defaultEmployerCalendar('GB')))).toEqual(defaultEmployerCalendar('GB'));
    for (const raw of ['2.[]', '1.null', '1.["US","",[],[["2027-02-30","Bad"]]]', '1.' + 'x'.repeat(16001)]) expect(decodeEmployerCalendar(raw)).toBeUndefined();
  });
  it('deduplicates entries while preserving two different holidays on the same date', () => {
    const a = { date: '2028-02-29', name: 'Leap day' };
    const value = { ...defaultEmployerCalendar('US'), custom: [a, a, { ...a, name: 'Founders day' }] };
    expect(decodeEmployerCalendar(encodeEmployerCalendar(value))?.custom).toHaveLength(2);
    expect(validCalendarDate('2027-02-29')).toBe(false);
    expect(validCalendarDate('2028-02-29')).toBe(true);
  });
  it('reading a shared override never mutates the recipient saved preferences', () => {
    const local = { ...defaultEmployerCalendar('US'), excluded: ['2027-12-24|Christmas Day'] };
    saveEmployerCalendar(local);
    decodeEmployerCalendar(encodeEmployerCalendar(defaultEmployerCalendar('US')));
    expect(readEmployerCalendar('US')).toEqual(local);
  });
  it('survives unavailable storage', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('disabled'); });
    expect(readEmployerCalendar('US')).toEqual(freshEmployerCalendar('US'));
    get.mockRestore();
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disabled'); });
    expect(saveEmployerCalendar(defaultEmployerCalendar('US'))).toBe(false);
    set.mockRestore();
  });
});

describe('employer calendar saves across tabs', () => {
  beforeEach(() => localStorage.clear());
  const key = `${EMPLOYER_STORAGE_PREFIX}US:`;
  const withHoliday = (name: string) => ({ ...defaultEmployerCalendar('US'), custom: [{ date: '2027-06-01', name }] });

  it('refuses to overwrite a calendar another tab saved after this one loaded it, then replaces it on a second save', () => {
    readEmployerCalendar('US');
    const otherTab = encodeEmployerCalendar(withHoliday('Other tab'));
    localStorage.setItem(key, otherTab);
    expect(writeEmployerCalendar(withHoliday('This tab'))).toBe('stale');
    expect(localStorage.getItem(key)).toBe(otherTab);
    expect(writeEmployerCalendar(withHoliday('This tab'))).toBe('saved');
    expect(readEmployerCalendar('US').custom[0].name).toBe('This tab');
  });

  it('quarantines an unreadable saved calendar before replacing it', () => {
    localStorage.setItem(key, '1.["US",');
    expect(readEmployerCalendar('US')).toEqual(freshEmployerCalendar('US'));
    expect(writeEmployerCalendar(withHoliday('Fresh'))).toBe('saved');
    expect(JSON.parse(localStorage.getItem(`${key}.quarantine`)!)[0].raw).toBe('1.["US",');
  });
});

describe('version 2 calendars and migration of stored profiles', () => {
  beforeEach(() => localStorage.clear());

  it('reads an old stored version 1 profile unchanged, under the same storage key', () => {
    const raw = '1.["US","US-CA",["2027-02-12|Lincoln\'s Birthday"],[["2027-08-13","Summer Friday"]]]';
    localStorage.setItem(`${EMPLOYER_STORAGE_PREFIX}US:US-CA`, raw);
    const calendar = readEmployerCalendar('US', 'US-CA');
    expect(calendar).toEqual({ version: 1, country: 'US', subdivision: 'US-CA', excluded: ["2027-02-12|Lincoln's Birthday"], custom: [{ date: '2027-08-13', name: 'Summer Friday' }] });
    expect(encodeEmployerCalendar(calendar)).toBe(raw);
    // Upgrading on first edit keeps everything and saves to the same key.
    const upgraded = upgradeEmployerCalendar(calendar, ["Lincoln's Birthday", 'Cesar Chavez Day']);
    expect(upgraded).toMatchObject({ version: 2, excluded: calendar.excluded, custom: calendar.custom, regional: ['Cesar Chavez Day', "Lincoln's Birthday"] });
    expect(writeEmployerCalendar(upgraded)).toBe('saved');
    expect(localStorage.getItem(`${EMPLOYER_STORAGE_PREFIX}US:US-CA`)?.startsWith('2.')).toBe(true);
    expect(readEmployerCalendar('US', 'US-CA')).toEqual(upgraded);
  });

  it('round trips every version 2 field and rejects malformed ones', () => {
    const v2 = { ...freshEmployerCalendar('US', 'US-NY'), skipped: ['Columbus Day'], regional: ["Lincoln's Birthday"], extras: ['christmas-eve'], custom: [{ date: '2027-07-06', name: 'Shutdown' }] };
    expect(decodeEmployerCalendar(encodeEmployerCalendar(v2))).toEqual(v2);
    for (const raw of ['2.["US","",[],[]]', '2.["US","",[],[],["\\u0001"],[],[]]', '2.["US","",[],[],[],[],["Bad Id"]]']) expect(decodeEmployerCalendar(raw)).toBeUndefined();
    expect(employerCalendarCustomized(freshEmployerCalendar('US'))).toBe(false);
    expect(employerCalendarCustomized({ ...freshEmployerCalendar('US'), extras: ['new-years-eve'] })).toBe(true);
  });

  it('a region with nothing saved inherits the country choices, with its own regional days opt-in', () => {
    saveEmployerCalendar({ ...freshEmployerCalendar('US'), skipped: ['Columbus Day'], extras: ['christmas-eve'] });
    expect(readEmployerCalendar('US', 'US-TX')).toEqual({ ...freshEmployerCalendar('US', 'US-TX'), skipped: ['Columbus Day'], extras: ['christmas-eve'] });
    expect(hasStoredEmployerCalendar('US', 'US-TX')).toBe(false);
    expect(hasStoredEmployerCalendar('US')).toBe(true);
  });

  it('never downgrades a calendar a newer app version saved', () => {
    const key = `${EMPLOYER_STORAGE_PREFIX}US:`;
    localStorage.setItem(key, '3.["US","",[],[],[],[],[],{}]');
    readEmployerCalendar('US');
    expect(writeEmployerCalendar(freshEmployerCalendar('US'))).toBe('newer-version');
    expect(localStorage.getItem(key)).toBe('3.["US","",[],[],[],[],[],{}]');
  });
});
