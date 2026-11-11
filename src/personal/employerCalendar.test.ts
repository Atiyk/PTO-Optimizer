import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultEmployerCalendar, encodeEmployerCalendar, decodeEmployerCalendar, readEmployerCalendar, saveEmployerCalendar, deleteEmployerCalendar, validCalendarDate, writeEmployerCalendar, EMPLOYER_STORAGE_PREFIX } from './employerCalendar';

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
    expect(readEmployerCalendar('US')).toEqual(defaultEmployerCalendar('US'));
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
    expect(readEmployerCalendar('US')).toEqual(defaultEmployerCalendar('US'));
    expect(writeEmployerCalendar(withHoliday('Fresh'))).toBe('saved');
    expect(JSON.parse(localStorage.getItem(`${key}.quarantine`)!)[0].raw).toBe('1.["US",');
  });
});
