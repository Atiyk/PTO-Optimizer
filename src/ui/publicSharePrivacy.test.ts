import { describe, expect, it } from 'vitest';
import { encodeEmployerCalendar } from '../personal/employerCalendar';
import { readFullStateFromURL } from './urlState';
import { buildPublicPlanLink, employerLabelsWouldBeShared } from './publicSharePrivacy';

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
    expect([...url.searchParams.keys()].sort()).toEqual(['b', 'c', 'e', 's']);
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
      .toEqual({ url: 'https://gapless.example/pto?c=US&b=12', omittedPrivateCalendar: false });
    const protocolRelative = buildPublicPlanLink(
      'https://gapless.example//untrusted.example/path?private=1', 'c=US&b=12',
    );
    expect(new URL(protocolRelative.url).origin).toBe('https://gapless.example');
    expect(new URL(protocolRelative.url).pathname).toBe('//untrusted.example/path');
    expect(employerLabelsWouldBeShared('eh=invalid-private-data')).toBe(true);
    const malformed = buildPublicPlanLink('https://gapless.example/pto', 'c=US&eh=invalid-private-data');
    expect(malformed.url).toBe('https://gapless.example/pto?c=US');
    expect(malformed.omittedPrivateCalendar).toBe(true);
  });
});
