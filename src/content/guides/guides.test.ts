import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, Fragment } from 'react';
import { GUIDES, findGuide } from './index.ts';
import { linkTargets, renderGuideMarkdown } from './markdown.tsx';
import { VOCABULARY } from '../vocabulary.ts';
import { rawHolidaysToHolidays } from '@daysoff/engine/data/holidays';

type RawHoliday = Parameters<typeof rawHolidaysToHolidays>[0][number];

// import.meta.glob keeps Node-only filesystem imports out of the browser tsconfig.
const HOLIDAY_FILES: Record<string, unknown> = import.meta.glob('../../../public/holidays/US-{2026,2027,2028}.json', { import: 'default', eager: true });
const GUIDE_HTML: Record<string, string> = import.meta.glob('../../../guides/*/index.html', { query: '?raw', import: 'default', eager: true });
const words = (s: string) => s.trim().split(/\s+/).length;
const allText = (g: (typeof GUIDES)[number]) => [g.title, g.metaTitle, g.description, g.summary, g.body, ...g.faq.flatMap((f) => [f.question, f.answer])].join('\n');

const usHolidays = new Set(
  [2026, 2027, 2028].flatMap((y) => {
    const raw = HOLIDAY_FILES[`../../../public/holidays/US-${y}.json`] as RawHoliday[];
    return rawHolidaysToHolidays(raw.filter((h) => h.global)).map((h) => h.date);
  }),
);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dow = (y: number, m: number, d: number) => DAYS[new Date(Date.UTC(y, m, d)).getUTCDay()];

describe('guides: metadata', () => {
  it('has unique, URL-safe ids and resolvable related guides', () => {
    const ids = GUIDES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of GUIDES) {
      expect(g.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      for (const r of g.related) expect(findGuide(r), `${g.id} -> ${r}`).toBeDefined();
    }
  });

  it('keeps titles, descriptions and summaries to search-snippet lengths', () => {
    for (const g of GUIDES) {
      expect(g.metaTitle.length, g.id).toBeLessThanOrEqual(60);
      expect(g.description.length, g.id).toBeGreaterThanOrEqual(110);
      expect(g.description.length, g.id).toBeLessThanOrEqual(165);
      expect(words(g.summary), g.id).toBeGreaterThanOrEqual(30);
      expect(words(g.summary), g.id).toBeLessThanOrEqual(75);
      expect(g.updated >= g.published, g.id).toBe(true);
    }
  });

  it('gives every guide quotable FAQ answers of 20 to 60 words', () => {
    for (const g of GUIDES) {
      expect(g.faq.length, g.id).toBeGreaterThanOrEqual(4);
      for (const f of g.faq) {
        expect(f.question.endsWith('?'), f.question).toBe(true);
        expect(words(f.answer), f.question).toBeGreaterThanOrEqual(20);
        expect(words(f.answer), f.question).toBeLessThanOrEqual(60);
      }
    }
  });

  it('cites at least one source, each an https URL', () => {
    for (const g of GUIDES) {
      expect(g.sources.length, g.id).toBeGreaterThan(0);
      for (const s of g.sources) expect(s.url, g.id).toMatch(/^https:\/\//);
    }
  });
});

describe('guides: copy', () => {
  // Whole words, so "front-loaded" isn't read as the banned "LOA".
  const banned = VOCABULARY.flatMap((v) => v.banned).map((w) => ({ w, re: new RegExp(`\\b${w.replace(/[-]/g, '\\-')}\\b`, 'i') }));
  it('uses the site vocabulary', () => {
    for (const g of GUIDES) expect(banned.filter(({ re }) => re.test(allText(g))).map(({ w }) => w), g.id).toEqual([]);
  });

  it('uses no em or en dashes', () => {
    for (const g of GUIDES) expect(allText(g), g.id).not.toMatch(/[—–]/);
  });

  it('pairs every short date with the weekday it really falls on', () => {
    const re = new RegExp(`\\b(${DAYS.join('|')}) (${MONTHS.join('|')}) (\\d{1,2})\\b`, 'g');
    for (const g of GUIDES) {
      for (const m of allText(g).matchAll(re)) {
        const [whole, day, mon, dateStr] = m;
        const month = MONTHS.indexOf(mon);
        const years = month === 11 ? [2026, 2027] : month === 0 ? [2027, 2028] : [2027];
        expect(years.some((y) => dow(y, month, Number(dateStr)) === day), `${g.id}: ${whole}`).toBe(true);
      }
    }
  });
});

describe('guides: links', () => {
  const routes = new Set(['/', '/pto', '/policy', '/family', '/sabbatical', '/glossary', '/faq', '/guides', ...GUIDES.map((g) => `/guides/${g.id}`)]);

  it('points every internal link at a real route', () => {
    for (const g of GUIDES) {
      for (const href of [...linkTargets(g.body), g.action.href]) {
        if (/^https?:\/\//.test(href)) continue;
        expect(routes.has(href.split(/[?#]/)[0]), `${g.id}: ${href}`).toBe(true);
      }
    }
  });

  it('pins only US working days, within the plan range and budget', () => {
    let checked = 0;
    for (const g of GUIDES) {
      for (const href of [...linkTargets(g.body), g.action.href]) {
        if (!href.startsWith('/pto?')) continue;
        const params = new URLSearchParams(href.split('?')[1]);
        expect(params.get('c')).toBe('US');
        const pins = (params.get('p') ?? '').split(',').filter(Boolean);
        expect(pins.length, href).toBeLessThanOrEqual(Number(params.get('b')));
        for (const day of pins) {
          const d = new Date(`${day}T00:00:00Z`).getUTCDay();
          expect(d !== 0 && d !== 6, `${g.id}: ${day} is a weekend`).toBe(true);
          expect(usHolidays.has(day), `${g.id}: ${day} is a federal holiday`).toBe(false);
          expect(day >= params.get('s')! && day <= params.get('e')!, `${g.id}: ${day} out of range`).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});

describe('guides: committed HTML', () => {
  it('has a page per guide with its current title and description', () => {
    for (const g of GUIDES) {
      const html = GUIDE_HTML[`../../../guides/${g.id}/index.html`];
      expect(html, `guides/${g.id}/index.html: run scripts/generate-guide-html.ts`).toBeTypeOf('string');
      expect(html, g.id).toContain(`<title>${g.metaTitle} — %PRODUCT_NAME%</title>`);
      expect(html, g.id).toContain(`content="${g.description}"`);
      expect(html, g.id).toContain(`href="%SITE_URL%/guides/${g.id}"`);
    }
  });
});

describe('guide markdown', () => {
  const html = (md: string) => renderToStaticMarkup(createElement(Fragment, null, ...renderGuideMarkdown(md)));

  it('renders headings with ids, lists, callouts and inline marks', () => {
    const out = html('## The best days\n\n- one **two**\n- [three](/pto)\n\n> a [plan](/pto?c=US)\n\nPlain text.');
    expect(out).toContain('<h2 id="the-best-days"');
    expect(out).toContain('<strong class="font-semibold text-ink">two</strong>');
    expect(out).toContain('href="/pto"');
    expect(out).toContain('href="/pto?c=US"');
    expect(out).toContain('<p class="mt-4');
  });

  it('labels every table cell with its column for the phone layout', () => {
    const out = html('| Book | PTO days |\n|---|---|\n| Fri Jul 2 | 1 |');
    expect(out).toContain('<th scope="col"');
    expect(out).toContain('data-label="Book"');
    expect(out).toContain('data-label="PTO days"');
  });

  it('marks external links noopener', () => {
    expect(html('[OPM](https://www.opm.gov/)')).toContain('rel="noopener noreferrer"');
  });
});
