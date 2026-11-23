import { describe, expect, it } from 'vitest';
import { planGuideJsonLd } from './planGuideJsonLd';
import { PLAN_GUIDES, planGuideFacts } from './planGuides2027';

describe('guide structured data', () => {
  it.each(PLAN_GUIDES.map((g) => [g.path, g] as const))('%s has Article, BreadcrumbList and the visible FAQs', (path, guide) => {
    const meta = { title: guide.title, description: 'd', canonical: `https://example.test${path}` };
    const [article, crumbs, faq] = planGuideJsonLd(path, 'https://example.test', meta) as Record<string, unknown>[];
    expect(article['@type']).toBe('Article');
    expect(article.dateModified).toBe(guide.lastChecked);
    expect(crumbs['@type']).toBe('BreadcrumbList');
    const items = crumbs.itemListElement as { item: string }[];
    expect(items.map((i) => i.item)).toEqual(['https://example.test/', 'https://example.test/guides', meta.canonical]);
    expect(faq['@type']).toBe('FAQPage');
    const f = planGuideFacts(guide);
    expect((faq.mainEntity as { name: string; acceptedAnswer: { text: string } }[]).map((q) => [q.name, q.acceptedAnswer.text]))
      .toEqual(guide.faqs.map((q) => [q.question, q.answer(f)]));
  });

  it('returns nothing for an unknown guide', () => {
    expect(planGuideJsonLd('/guides/nope', 'https://example.test', { title: '', description: '', canonical: '' })).toEqual([]);
  });
});
