import { describe, expect, it } from 'vitest';
import { GUIDE_HOLIDAY_FILES } from './guideHolidays';
import { guideHolidayList } from './guidePlan';
import { EXPIRING_2026, expiringFacts, GUIDES, guideFacts, findGuide, type Guide } from './guides2027';

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;
// Every committed holiday file, by name only (lazy glob: nothing is loaded).
const COMMITTED_FILES = new Set(Object.keys(import.meta.glob('../../../public/holidays/*.json')).map((k) => k.split('/').pop()!.replace('.json', '')));

/** Holiday files a guide needs: its own year and the next (Dec 31 observed days). */
function missingHolidayFiles(guide: Pick<Guide, 'country' | 'year'>): string[] {
  return [guide.year, guide.year + 1]
    .map((year) => `${guide.country}-${year}`)
    .filter((key) => !(key in GUIDE_HOLIDAY_FILES) || !COMMITTED_FILES.has(key));
}

describe('guide config', () => {
  it('has holiday data for every guide year', () => {
    for (const guide of GUIDES) expect(missingHolidayFiles(guide), guide.path).toEqual([]);
  });

  it('flags a guide year with no holiday data', () => {
    expect(missingHolidayFiles({ country: 'US', year: 2031 })).toEqual(['US-2031', 'US-2032']);
  });

  it('computes a non-empty plan, holiday list and sane totals for every plan', () => {
    for (const guide of GUIDES) {
      const f = guideFacts(guide);
      expect(f.holidays.length, guide.path).toBeGreaterThan(0);
      for (const plan of f.plans) {
        const label = `${guide.path} ${plan.spec.id}`;
        expect(plan.breaks.length, label).toBeGreaterThan(0);
        expect(plan.ptoUsed, label).toBeGreaterThan(0);
        expect(plan.ptoUsed + plan.reserveKept, label).toBeLessThanOrEqual(plan.budget);
        expect(plan.daysOff, label).toBeGreaterThan(plan.ptoUsed);
        expect(plan.breaks.flatMap((b) => b.ptoDays)).toHaveLength(plan.ptoUsed);
        for (const b of plan.breaks) expect(b.start >= `${guide.year}-01-01` && b.end <= `${guide.year}-12-31`, label).toBe(true);
      }
    }
  });

  it('gives each page a unique path, title and description of a usable length', () => {
    const seen = { path: new Set<string>(), title: new Set<string>(), description: new Set<string>() };
    for (const guide of GUIDES) {
      const description = guide.description(guideFacts(guide));
      for (const [key, value] of [['path', guide.path], ['title', guide.title], ['description', description]] as const) {
        expect(seen[key].has(value), `${key} ${value}`).toBe(false);
        seen[key].add(value);
      }
      expect(guide.title.length, guide.title).toBeLessThanOrEqual(65);
      expect(description.length, description).toBeGreaterThanOrEqual(90);
      expect(description.length, description).toBeLessThanOrEqual(170);
    }
  });

  it('has 3 to 5 visible FAQs per page with short, self-contained answers', () => {
    for (const guide of GUIDES) {
      expect(guide.faqs.length, guide.path).toBeGreaterThanOrEqual(3);
      expect(guide.faqs.length, guide.path).toBeLessThanOrEqual(5);
      expect(new Set(guide.faqs.map((q) => q.id)).size).toBe(guide.faqs.length);
      for (const faq of guide.faqs) expect(words(faq.answer(guideFacts(guide))), faq.id).toBeLessThanOrEqual(60);
    }
  });

  it('finds guides by path with or without a trailing slash', () => {
    expect(findGuide('/2027/')?.path).toBe('/2027');
    expect(findGuide('/2027/10-pto-days')?.budget).toBe(10);
    expect(findGuide('/2027/nope')).toBeUndefined();
  });
});

describe('claims the copy makes', () => {
  const hub = guideFacts(findGuide('/2027')!);

  it('every 2027 US federal holiday date is a Monday, Thursday or Friday', () => {
    expect(new Set(hub.holidays.map((h) => h.weekday))).toEqual(new Set(['Mon', 'Thu', 'Fri']));
  });

  it('March, April and August 2027 have no US federal holiday', () => {
    expect(hub.holidays.filter((h) => ['03', '04', '08'].includes(h.date.slice(5, 7)))).toEqual([]);
  });

  it('New Year\'s Day 2028 is observed on Friday, Dec 31, 2027 and Christmas on Friday, Dec 24', () => {
    expect(hub.holidays.filter((h) => h.date >= '2027-12-01')).toEqual([
      { date: '2027-12-24', name: 'Christmas Day', weekday: 'Fri' },
      { date: '2027-12-31', name: "New Year's Day", weekday: 'Fri' },
    ]);
  });

  it('four PTO days join Christmas to New Year for 10 days off', () => {
    expect(hub.gapFills).toEqual([{ ptoDays: ['2027-12-27', '2027-12-28', '2027-12-29', '2027-12-30'], run: { start: '2027-12-24', end: '2028-01-02', length: 10 }, holidays: ['2027-12-24', '2027-12-31'] }]);
  });

  it('the 10-day most-days-off plan puts every PTO day beside a holiday', () => {
    const f = guideFacts(findGuide('/2027/10-pto-days')!);
    const holidays = new Set(f.holidays.map((h) => h.date));
    for (const b of f.plans[0].breaks) {
      expect(b.totalDaysOff).toBe(4);
      expect(b.ptoCost).toBe(1);
      const days: string[] = [];
      for (let d = new Date(`${b.start}T00:00:00Z`); d <= new Date(`${b.end}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
      expect(days.some((d) => holidays.has(d)), b.start).toBe(true);
    }
  });

  it('the six-holiday list keeps exactly those six holidays (seven dates in 2027)', () => {
    const f = guideFacts(findGuide('/2027/10-pto-days')!);
    expect(f.plans[1].holidays.map((h) => h.date)).toEqual(['2027-01-01', '2027-05-31', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24', '2027-12-31']);
  });

  it('the four-day-week page names the four Friday holidays', () => {
    const f = guideFacts(findGuide('/2027/four-day-week')!);
    expect(f.weekends.filter((w) => !w.onWorkday).map((w) => w.date)).toEqual(['2027-01-01', '2027-06-18', '2027-12-24', '2027-12-31']);
  });

  it('the England and Wales page has Easter as a 10-day break for 4 days of leave', () => {
    const f = guideFacts(findGuide('/2027/uk-annual-leave')!);
    expect(f.plans[0].breaks.find((b) => b.end === '2027-03-29')).toMatchObject({ start: '2027-03-20', ptoCost: 4, totalDaysOff: 10 });
    expect(guideHolidayList(findGuide('/2027/uk-annual-leave')!)).toHaveLength(8);
  });

  it('the 2026 year-end section lists only holidays after its date', () => {
    const e = expiringFacts();
    expect(e.weekends.map((w) => [w.date, w.withOneDay?.date])).toEqual([['2026-11-26', '2026-11-27'], ['2026-12-25', '2026-12-24']]);
    expect(e.gapFills).toEqual([{ ptoDays: ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31'], run: { start: '2026-12-25', end: '2027-01-03', length: 10 }, holidays: ['2026-12-25', '2027-01-01'] }]);
    expect(EXPIRING_2026.from > '2026-11-11').toBe(true);
  });
});
