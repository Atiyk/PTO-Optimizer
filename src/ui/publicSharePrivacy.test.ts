import { describe, expect, it } from 'vitest';
import { encodeEmployerCalendar } from '../personal/employerCalendar';
import { readFullStateFromURL } from './urlState';
import { buildPublicPlanLink, buildPublicPlanSearch, employerLabelsWouldBeShared } from './publicSharePrivacy';
import { planFromSearch } from '../autopilot/planFromSearch';

const calendar = encodeEmployerCalendar({
  version: 1 as const, country: 'US', excluded: ['2027-12-24|PRIVATE_POLICY_EXCLUSION'],
  custom: [{ date: '2027-12-27', name: 'PRIVATE_EMPLOYER_POLICY_TITLE' }],
});
const search = 'c=US&s=2027-01-01&e=2027-12-31&b=12&eh=' + encodeURIComponent(calendar);
describe('public plan link privacy', () => {
  it('omits employer calendar labels, private fragments and incidental browser query keys', () => {
    expect(employerLabelsWouldBeShared(search)).toBe(true);
    const share = buildPublicPlanLink(
      'https://gapless.example/pto?access_token=PRIVATE_TOKEN#PRIVATE_FRAGMENT', search,
    );
    const url = new URL(share.url);
    expect(share.omittedPrivateCalendar).toBe(true);
    expect(url.origin + url.pathname).toBe('https://gapless.example/pto');
    expect([...url.searchParams.keys()].sort()).toEqual(['b', 'c', 'e', 's', 'sv']);
    expect(url.searchParams.get('b')).toBe('12');
    expect(share.url).not.toMatch(/PRIVATE_|eh=|access_token=|#/);
    const received = readFullStateFromURL(url.search, {
      rangeStart: '2027-01-01', rangeEnd: '2027-12-31', budget: 8, country: 'US',
    });
    expect(received.employerCalendar).toBeUndefined();
    expect(received.budget).toBe(12);
  });
  it('leaves ordinary nonprivate plan links reproducible and fails closed on unrecognized employer data', () => {
    expect(employerLabelsWouldBeShared('c=US&b=12')).toBe(false);
    expect(buildPublicPlanLink('https://gapless.example/pto?utm=x', 'c=US&b=12'))
      .toEqual({ url: 'https://gapless.example/pto?sv=1&c=US&b=12', omittedPrivateCalendar: false });
    const protocolRelative = buildPublicPlanLink(
      'https://gapless.example//untrusted.example/path?private=1', 'c=US&b=12',
    );
    expect(new URL(protocolRelative.url).origin).toBe('https://gapless.example');
    expect(new URL(protocolRelative.url).pathname).toBe('//untrusted.example/path');
    expect(employerLabelsWouldBeShared('eh=invalid-private-data')).toBe(true);
    const malformed = buildPublicPlanLink('https://gapless.example/pto', 'c=US&eh=invalid-private-data');
    expect(malformed.url).toBe('https://gapless.example/pto?sv=1&c=US');
    expect(malformed.omittedPrivateCalendar).toBe(true);
  });
  it('requires an explicit observed date selection and strips unrelated private state', () => {
    const input = search + '&ho=2027-04-12&sv=1&bo=2027-04-15&od=2027-04-16&r=2027-04-17&cc=4&np=21&note=PRIVATE_NOTE&p=2027-01-04,PRIVATE_TITLE';
    const publicDefault = new URLSearchParams(buildPublicPlanSearch(input));
    expect(Object.fromEntries(publicDefault)).toEqual({ sv: '1', c: 'US', s: '2027-01-01', e: '2027-12-31', b: '12', p: '2027-01-04' });
    const explicitlyShared = buildPublicPlanSearch(input, ['2027-12-27', '2027-07-05', '2027-12-27', 'PRIVATE_TITLE']);
    const shared = new URLSearchParams(explicitlyShared);
    expect(shared.get('ho')).toBe('2027-07-05,2027-12-27');
    expect([...shared.keys()].sort()).toEqual(['b', 'c', 'e', 'ho', 'p', 's', 'sv']);
    const defaults = { rangeStart: '2027-01-01', rangeEnd: '2027-12-31', budget: 8, country: 'US' };
    expect(readFullStateFromURL(explicitlyShared, defaults)).toMatchObject({
      publicShareVersion: 1, sharedObservedHolidays: ['2027-07-05', '2027-12-27'], overlapDays: [], blackouts: [],
    });
    expect(readFullStateFromURL(buildPublicPlanSearch(input, []), defaults).sharedObservedHolidays).toEqual([]);
    expect(readFullStateFromURL('sv=1&ho=2027-02-30', defaults).sharedObservedHolidays).toBeUndefined();
  });
  it('reproduces observed dates even when the recipient has different public holiday data', () => {
    const shared = buildPublicPlanSearch(search, ['2027-12-27']);
    const result = planFromSearch(shared, '2026-11-10', () => [{
      date: '2027-12-24', localName: 'Public holiday from recipient data', name: 'Public holiday',
      countryCode: 'US', global: true, counties: null,
    }]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.solveInput.offDays).toEqual(['2027-12-27']);
    expect(result.holidayEntries).toEqual([{
      date: '2027-12-27', name: 'Shared observed holiday', source: 'custom', checked: true,
    }]);
    expect(JSON.stringify(result)).not.toContain('PRIVATE_');
  });
});
