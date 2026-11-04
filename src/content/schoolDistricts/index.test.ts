import { describe, it, expect } from 'vitest';
import {
  SCHOOL_DISTRICT_PRESETS,
  SCHOOL_PRESETS_AS_OF,
  findDistrictPreset,
  presetLabels,
  presetOffDays,
  type SchoolDistrictPreset,
} from './index';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function isValidISO(s: string): boolean {
  if (!ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function weekdaysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) {
    const d = new Date(t);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Official district domains. Sources must be on one of these, never a news or aggregator site. */
const DISTRICT_DOMAINS = [
  'schools.nyc.gov',
  'cps.edu',
  'lausd.org',
  'browardschools.com',
  'houstonisd.org',
  'fcps.edu',
  'gcpsk12.org',
  'montgomeryschoolsmd.org',
  'dallasisd.org',
  'philasd.org',
  'seattleschools.org',
  'austinisd.org',
];

function onDistrictDomain(url: string): boolean {
  const host = new URL(url).hostname;
  return DISTRICT_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

function preset(id: string): SchoolDistrictPreset {
  const p = findDistrictPreset(id);
  if (!p) throw new Error(`missing preset ${id}`);
  return p;
}

describe('school district presets: structure', () => {
  it('has around a dozen presets with unique ids', () => {
    expect(SCHOOL_DISTRICT_PRESETS.length).toBeGreaterThanOrEqual(10);
    const ids = SCHOOL_DISTRICT_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is sorted by shortName', () => {
    const names = SCHOOL_DISTRICT_PRESETS.map((p) => p.shortName);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
  });

  it('has an ISO as-of date', () => {
    expect(SCHOOL_PRESETS_AS_OF).toBe('2026-11-04');
  });

  for (const p of SCHOOL_DISTRICT_PRESETS) {
    describe(p.id, () => {
      it('has the required identity fields', () => {
        expect(p.id).toMatch(/^[a-z0-9-]+-2026-27$/);
        expect(p.district.length).toBeGreaterThan(0);
        expect(p.shortName.length).toBeGreaterThan(0);
        expect(p.city.length).toBeGreaterThan(0);
        expect(p.state).toMatch(/^[A-Z]{2}$/);
        expect(p.schoolYear).toBe('2026-27');
      });

      it('starts in Aug/Sep 2026 and ends in May/Jun 2027', () => {
        expect(isValidISO(p.firstDay)).toBe(true);
        expect(isValidISO(p.lastDay)).toBe(true);
        expect(p.firstDay.slice(0, 7)).toMatch(/^2026-0[89]$/);
        expect(p.lastDay.slice(0, 7)).toMatch(/^2027-0[56]$/);
      });

      it('has valid, ordered, in-year closures that each include a weekday', () => {
        expect(p.closures.length).toBeGreaterThan(0);
        let prev = '';
        for (const c of p.closures) {
          expect(isValidISO(c.start), c.start).toBe(true);
          expect(isValidISO(c.end), c.end).toBe(true);
          expect(c.start <= c.end, `${c.start}..${c.end}`).toBe(true);
          expect(c.start > p.firstDay, `${c.start} after first day`).toBe(true);
          expect(c.end < p.lastDay, `${c.end} before last day`).toBe(true);
          expect(c.start > prev, `${c.start} sorted and not overlapping`).toBe(true);
          expect(weekdaysBetween(c.start, c.end).length, `${c.start} has a weekday`).toBeGreaterThan(0);
          expect(c.label.trim().length).toBeGreaterThan(0);
          expect(['break', 'holiday', 'staff-day', 'weather-makeup-reserve', 'other']).toContain(c.kind);
          prev = c.end;
        }
      });

      it('cites an https source on the district domain with a retrieved date', () => {
        expect(p.source.url.startsWith('https://')).toBe(true);
        expect(onDistrictDomain(p.source.url), p.source.url).toBe(true);
        expect(p.source.title.length).toBeGreaterThan(0);
        expect(isValidISO(p.source.retrieved)).toBe(true);
        expect(p.source.retrieved <= SCHOOL_PRESETS_AS_OF).toBe(true);
        if (p.source.documentDate) expect(isValidISO(p.source.documentDate)).toBe(true);
      });

      it('closes for Thanksgiving Thursday and Friday 2026', () => {
        const off = presetOffDays(p);
        expect(off).toContain('2026-11-26');
        expect(off).toContain('2026-11-27');
      });

      it('closes on Jan 1, 2027 and Jan 18, 2027 (MLK Day)', () => {
        const off = presetOffDays(p);
        expect(off).toContain('2027-01-01');
        expect(off).toContain('2027-01-18');
      });
    });
  }
});

describe('presetOffDays / presetLabels', () => {
  it('expands ranges, skips weekends, sorts and dedupes', () => {
    const p: SchoolDistrictPreset = {
      ...preset('nyc-doe-2026-27'),
      closures: [
        { start: '2026-12-24', end: '2027-01-01', label: 'Winter Recess', kind: 'break' },
        { start: '2026-12-31', end: '2026-12-31', label: 'Overlap', kind: 'holiday' },
        { start: '2026-11-26', end: '2026-11-27', label: 'Thanksgiving', kind: 'break' },
      ],
    };
    expect(presetOffDays(p)).toEqual([
      '2026-11-26',
      '2026-11-27',
      '2026-12-24',
      '2026-12-25',
      '2026-12-28',
      '2026-12-29',
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
    ]);
    const labels = presetLabels(p);
    expect(labels['2026-12-31']).toBe('Winter Recess');
    expect(labels['2026-12-26']).toBeUndefined();
    expect(Object.keys(labels).sort()).toEqual(presetOffDays(p));
  });

  it('labels every off day for every preset', () => {
    for (const p of SCHOOL_DISTRICT_PRESETS) {
      expect(Object.keys(presetLabels(p)).sort()).toEqual(presetOffDays(p));
    }
  });

  it('returns undefined for unknown ids', () => {
    expect(findDistrictPreset('nope')).toBeUndefined();
  });
});

describe('spot checks against the official calendars', () => {
  it('NYC: Yom Kippur, Eid al-Fitr and spring recess Apr 22–30, 2027', () => {
    const off = presetOffDays(preset('nyc-doe-2026-27'));
    expect(off).toContain('2026-09-21');
    expect(off).toContain('2027-03-09');
    expect(off.filter((d) => d >= '2027-04-22' && d <= '2027-04-30')).toHaveLength(7);
    // Election Day 2026 is a remote-learning day in NYC, not a closure.
    expect(off).not.toContain('2026-11-03');
  });

  it('Chicago: General Election Nov 3, 2026 is a holiday', () => {
    expect(presetOffDays(preset('chicago-cps-2026-27'))).toContain('2026-11-03');
  });

  it('Gwinnett: Feb 12–16, 2027 school holiday is three weekdays', () => {
    const off = presetOffDays(preset('gwinnett-gcps-2026-27'));
    expect(off.filter((d) => d >= '2027-02-12' && d <= '2027-02-16')).toEqual([
      '2027-02-12',
      '2027-02-15',
      '2027-02-16',
    ]);
  });

  it('Montgomery County: spring closure runs Fri Mar 26 to Fri Apr 2, 2027', () => {
    const off = presetOffDays(preset('montgomery-mcps-2026-27'));
    expect(off.filter((d) => d >= '2027-03-26' && d <= '2027-04-02')).toHaveLength(6);
  });

  // Instructional-day totals the districts state themselves (or that their own day counters imply).
  // These guard against a dropped or invented closure.
  const STATED_STUDENT_DAYS: Record<string, number> = {
    'gwinnett-gcps-2026-27': 180,
    'lausd-2026-27': 180,
    'fairfax-fcps-2026-27': 180,
    'broward-bcps-2026-27': 180,
    'seattle-sps-2026-27': 180,
    'montgomery-mcps-2026-27': 181,
    'philadelphia-sdp-2026-27': 173,
    'austin-isd-2026-27': 171,
  };
  for (const [id, expected] of Object.entries(STATED_STUDENT_DAYS)) {
    it(`${id}: weekdays minus closures equals ${expected} student days`, () => {
      const p = preset(id);
      const off = new Set(presetOffDays(p));
      const school = weekdaysBetween(p.firstDay, p.lastDay).filter((d) => !off.has(d));
      expect(school).toHaveLength(expected);
    });
  }
});
