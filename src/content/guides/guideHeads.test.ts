import { describe, expect, it } from 'vitest';
import { GUIDES } from './guides2027';
import { guideHeadHtml, guideHtmlFile } from './guideHead';

const COMMITTED: Record<string, string> = import.meta.glob('../../../2027/**/index.html', { query: '?raw', import: 'default', eager: true });

describe('committed guide HTML shells', () => {
  it('has one file per guide, matching what scripts/generate-guide-html.ts writes', () => {
    expect(Object.keys(COMMITTED).sort()).toEqual(GUIDES.map((g) => `../../../${guideHtmlFile(g)}`).sort());
    for (const guide of GUIDES) expect(COMMITTED[`../../../${guideHtmlFile(guide)}`], guide.path).toBe(guideHeadHtml(guide));
  });

  it('gives each guide its own canonical URL and an article og:type', () => {
    for (const guide of GUIDES) {
      const html = guideHeadHtml(guide);
      expect(html).toContain(`<link rel="canonical" href="%SITE_URL%${guide.path}" />`);
      expect(html).toContain('<meta property="og:type" content="article" />');
      expect(html).not.toMatch(/Gapless|PTO Optimizer/);
    }
  });
});
