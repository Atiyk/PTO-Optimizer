import { describe, expect, it } from 'vitest';
import { guideJsonLd } from './guideJsonLd';
import { GUIDES, guideFacts } from './guides2027';

describe('guide structured data', () => {
  it.each(GUIDES.map((g) => [g.path, g] as const))('%s has Article, BreadcrumbList and the visible FAQs', (path, guide) => {
    const meta = { title: guide.title, description: 'd', canonical: `https://example.test${path}` };
    const [article, crumbs, faq] = guideJsonLd(path, 'https://example.test', meta) as Record<string, unknown>[];
    expect(article['@type']).toBe('Article');
    expect(article.dateModified).toBe(guide.lastChecked);
    expect(crumbs['@type']).toBe('BreadcrumbList');
    const items = crumbs.itemListElement as { item: string }[];
    expect(items.at(-1)!.item).toBe(path === '/2027' ? 'https://example.test/2027' : meta.canonical);
    expect(faq['@type']).toBe('FAQPage');
    const f = guideFacts(guide);
    expect((faq.mainEntity as { name: string; acceptedAnswer: { text: string } }[]).map((q) => [q.name, q.acceptedAnswer.text]))
      .toEqual(guide.faqs.map((q) => [q.question, q.answer(f)]));
  });

  it('returns nothing for an unknown guide', () => {
    expect(guideJsonLd('/2027/nope', 'https://example.test', { title: '', description: '', canonical: '' })).toEqual([]);
  });
});
