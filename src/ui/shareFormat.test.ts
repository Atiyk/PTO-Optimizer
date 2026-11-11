import { describe, expect, it } from 'vitest';
import type { WorkWeek } from '@daysoff/engine/solver/types';
import { encodeEmployerCalendar } from '../personal/employerCalendar';
import {
  FAMILY_ADDRESS_KEYS,
  FAMILY_URL_KEYS,
  PLAN_ADDRESS_KEYS,
  PLAN_SHARE_KEYS,
  PLAN_URL_KEYS,
  POLICY_ADDRESS_KEYS,
  POLICY_PRIVATE_KEYS,
  PUBLIC_SHARE_VERSION,
  partitionFamilyParams,
  partitionPlanParams,
} from './shareFormat';
import { writeBrowserPlanStateToURL, writeFullStateToURL, type WriteStateInput } from './urlState';
import { buildPublicPlanLink, buildPublicPlanSearch } from './publicSharePrivacy';
import { writeFamilyBrowserState, writeFamilyStateToURL } from './familyUrlState';
import { writePolicyStateToURL, defaultPolicyURLState } from './policyUrlState';
import { feedLinks } from './SubscribeFeed';

/** Every optional private field turned on, each carrying a recognisable value. */
const PRIVATE_NOTE = 'PRIVATE_EMPLOYER_SHUTDOWN';
const maximal: WriteStateInput = {
  planningVersion: 2, planningStyle: 'custom', minimumBreakDays: 4,
  employerCalendar: { version: 1, country: 'US', excluded: ['2027-07-05|Independence Day'], custom: [{ date: '2027-12-24', name: PRIVATE_NOTE }] },
  publicShareVersion: 1, sharedObservedHolidays: ['2027-01-01'],
  landingPreview: true, holidayFocusDate: '2027-05-31',
  country: 'US', subdivision: 'US-NY',
  rangeStart: '2027-01-01', rangeEnd: '2027-12-31', budget: 12, w: 40, breakCount: 2,
  weekStartOverride: 1,
  accrualEnabled: true, accrualPerMonth: 1.66,
  expiryEnabled: true, expiryDate: '2027-11-30', carryoverCap: 4,
  overlapDays: ['2027-03-03'], blackouts: ['2027-04-04'],
  workWeek: [true, true, true, true, false, false, false] as unknown as WorkWeek,
  forced: { '2027-02-02': 'include', '2027-02-09': 'exclude' },
  altFridayEnabled: true, altFridayStart: '2027-01-08',
  reserveDays: 2, unlimitedPto: true, noticePeriodDays: 21, noticeUnit: 'working',
  peakCapEnabled: true, peakCapStart: '2027-06-01', peakCapEnd: '2027-08-31', peakCapMaxDays: 3,
};

function keysOf(search: string | URLSearchParams): string[] {
  return [...new Set(new URLSearchParams(search).keys())].sort();
}

describe('versioned public share format (allowlist)', () => {
  it('is version 1 and every share key is also a classified plan key', () => {
    expect(PUBLIC_SHARE_VERSION).toBe(1);
    for (const key of PLAN_SHARE_KEYS) expect(PLAN_URL_KEYS).toHaveProperty(key);
    for (const key of PLAN_ADDRESS_KEYS) expect(PLAN_URL_KEYS).toHaveProperty(key);
  });

  it('classifies every key the planner codec can emit (fails when a new key is added unclassified)', () => {
    const params = new URLSearchParams();
    writeFullStateToURL(params, maximal);
    const unclassified = keysOf(params).filter(key => !Object.hasOwn(PLAN_URL_KEYS, key));
    expect(unclassified).toEqual([]);
  });

  it('never classifies a known private planner key as public', () => {
    for (const key of ['eh', 'bo', 'od', 'ov', 'pp', 'r', 'ac', 'am', 'ex', 'xd', 'cc', 'np', 'nu', 'pc', 'pcs', 'pce', 'pcm', 'up']) {
      expect(PLAN_URL_KEYS[key]).toBe('private');
      expect(PLAN_SHARE_KEYS).not.toContain(key);
      expect(PLAN_ADDRESS_KEYS).not.toContain(key);
    }
  });

  it('fails closed: an unknown key goes to on-device private state, never the address bar', () => {
    const full = new URLSearchParams({ c: 'US', b: '12', salary: '90000', employer: 'Acme', s: '2027-01-01' });
    const { address, draft } = partitionPlanParams(full);
    expect(keysOf(address)).toEqual(['b', 'c', 's']);
    expect(draft.get('salary')).toBe('90000');
    expect(draft.get('employer')).toBe('Acme');
  });

  it('writes only allowlisted keys into the address bar for a maximal private plan', () => {
    const params = new URLSearchParams('signin=ok&access_token=PRIVATE&jp=0');
    writeBrowserPlanStateToURL(params, maximal, null);
    const allowed = new Set<string>([...PLAN_ADDRESS_KEYS, 'signin', 'jp']);
    expect(keysOf(params).filter(key => !allowed.has(key))).toEqual([]);
    expect(params.toString()).not.toContain('PRIVATE');
    for (const date of ['2027-03-03', '2027-04-04', '2027-02-09', '2027-11-30', '2027-06-01', '2027-12-24']) {
      expect(params.toString()).not.toContain(date);
    }
  });

  it('writes only share-allowlisted keys into a copied public link, feed and email search', () => {
    const full = new URLSearchParams();
    writeFullStateToURL(full, maximal);
    const search = buildPublicPlanSearch(full.toString());
    expect(keysOf(search).filter(key => !(PLAN_SHARE_KEYS as readonly string[]).includes(key))).toEqual([]);
    expect(new URLSearchParams(search).get('sv')).toBe(String(PUBLIC_SHARE_VERSION));
    const link = buildPublicPlanLink('https://gapless.example/pto?eh=x&bo=2027-04-04#frag', full.toString()).url;
    const feed = feedLinks('https://gapless.example', search);
    for (const output of [search, link, feed.https, feed.webcal, decodeURIComponent(feed.google), decodeURIComponent(feed.outlook)]) {
      expect(output).not.toContain(PRIVATE_NOTE);
      expect(output).not.toMatch(/[?&](eh|bo|od|ov|pp|r|ac|am|ex|xd|cc|np|pc|pcs|pce|pcm|up|hd|lp)=/);
    }
  });
});

describe('family address allowlist', () => {
  it('classifies every family key and keeps school, district and partner data off the address bar', () => {
    const params = new URLSearchParams();
    writeFamilyStateToURL(params, {
      country: 'US', start: '2027-01-04', ptoBudget: 7, prioritizeCoverage: true, districtId: 'nyc-doe',
      customOffDays: ['2027-02-15'], excludedBreaks: ['2027-04-19'],
      availability: { days: ['2027-02-16'], freeDays: null, status: 'confirmed' }, ask: true,
    });
    expect(keysOf(params).filter(key => !Object.hasOwn(FAMILY_URL_KEYS, key))).toEqual([]);
    const browser = writeFamilyBrowserState({
      country: 'US', start: '2027-01-04', ptoBudget: 7, prioritizeCoverage: true, districtId: 'nyc-doe',
      customOffDays: ['2027-02-15'], excludedBreaks: ['2027-04-19'],
      availability: { days: ['2027-02-16'], freeDays: null, status: 'confirmed' }, ask: true,
    });
    expect(keysOf(browser.search).filter(key => !(FAMILY_ADDRESS_KEYS as readonly string[]).includes(key))).toEqual([]);
    expect(keysOf(browser.draft)).toEqual(['d', 'pp', 'sd', 'x']);
  });

  it('fails closed for an unknown family key', () => {
    const { address, draft } = partitionFamilyParams(new URLSearchParams({ c: 'US', childName: 'Sam' }));
    expect(keysOf(address)).toEqual(['c']);
    expect(draft.get('childName')).toBe('Sam');
  });
});

describe('policy (My PTO) keys', () => {
  it('treats every policy codec key as private and only the country as an address key', () => {
    const params = new URLSearchParams();
    writePolicyStateToURL(params, {
      ...defaultPolicyURLState(), workWeek: [true, true, true, true, true, false, false] as unknown as WorkWeek,
      subdivision: 'US-NY', altFridayStart: '2027-01-08', forecastDate: '2027-06-01', currentCarriedBalance: 2,
      unit: 'hours', hoursPerDay: 7.5, planYearKind: 'custom', waitingPeriodEnabled: true, negativeBalanceAllowance: 2,
      payoutOnLeaving: 'pays', carryoverUseByEnabled: true, balanceIncludesApprovedLeave: true,
      shiftMinutes: [450, 450, 450, 450, 450, 0, 0], plannedDays: ['2027-03-01'], accrualCapEnabled: false,
    });
    const keys = keysOf(params).filter(key => key !== 'c');
    expect(keys.filter(key => !(POLICY_PRIVATE_KEYS as readonly string[]).includes(key))).toEqual([]);
    expect([...POLICY_ADDRESS_KEYS]).toEqual(['c', 'signin', 'highlight']);
  });
});

describe('employer calendar labels in the private codec', () => {
  it('are encoded only under the private eh key', () => {
    expect(PLAN_URL_KEYS.eh).toBe('private');
    expect(encodeEmployerCalendar(maximal.employerCalendar!)).toContain('PRIVATE');
  });
});
