import { describe, expect, it } from 'vitest';
import { PLAN_GUIDES } from './planGuides2027';
import { planGuideHeadHtml, planGuideHtmlFile } from './planGuideHead';

const COMMITTED: Record<string, string> = import.meta.glob('../../../guides/*/index.html', { query: '?raw', import: 'default', eager: true });
// guides/ also holds the hand-written guides' shells (scripts/generate-guide-html.ts); only
// the ones that load the worked-plan bundle are this generator's.
const PLAN_SHELLS = Object.keys(COMMITTED).filter((k) => COMMITTED[k].includes('/src/plan-guide-main.tsx'));

describe('committed guide HTML shells', () => {
  it('has one file per guide, matching what scripts/generate-plan-guide-html.ts writes', () => {
    expect(PLAN_SHELLS.sort()).toEqual(PLAN_GUIDES.map((g) => `../../../${planGuideHtmlFile(g)}`).sort());
    for (const guide of PLAN_GUIDES) expect(COMMITTED[`../../../${planGuideHtmlFile(guide)}`], guide.path).toBe(planGuideHeadHtml(guide));
  });

  it('gives each guide its own canonical URL and an article og:type', () => {
    for (const guide of PLAN_GUIDES) {
      const html = planGuideHeadHtml(guide);
      expect(html).toContain(`<link rel="canonical" href="%SITE_URL%${guide.path}" />`);
      expect(html).toContain('<meta property="og:type" content="article" />');
      expect(html).not.toMatch(/Gapless|PTO Optimizer/);
    }
  });
});
