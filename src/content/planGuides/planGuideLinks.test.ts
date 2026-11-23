import { describe, expect, it } from 'vitest';
import { PLAN_GUIDE_LINKS, RELATED_GUIDE_LINKS } from './planGuideLinks';
import { PLAN_GUIDES } from './planGuides2027';
import { GUIDES } from '../guides';

describe('links to the worked-plan guides', () => {
  it('lists every plan guide, in order, with its path, heading and last-checked date', () => {
    expect(PLAN_GUIDE_LINKS.map((l) => [l.href, l.title, l.updated])).toEqual(PLAN_GUIDES.map((g) => [g.path, g.h1, g.lastChecked]));
  });

  it('keeps each blurb free of numbers the page computes', () => {
    for (const l of PLAN_GUIDE_LINKS) expect(l.blurb, l.href).not.toMatch(/\d+ days off/);
  });

  it('never shares a path with a hand-written guide', () => {
    const ids = new Set(GUIDES.map((g) => `/guides/${g.id}`));
    for (const l of PLAN_GUIDE_LINKS) expect(ids.has(l.href), l.href).toBe(false);
  });

  it('points related links at real guides, labelled with the start of their titles', () => {
    for (const r of RELATED_GUIDE_LINKS) {
      const guide = GUIDES.find((g) => `/guides/${g.id}` === r.href);
      expect(guide, r.href).toBeDefined();
      expect(guide!.title.split(':')[0]).toBe(r.label);
    }
  });
});
