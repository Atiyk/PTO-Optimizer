/**
 * Structured data for a guide page, built from the same config and computed facts the page
 * renders (so the FAQPage answers are the visible answers, word for word).
 */
import { PRODUCT_NAME } from '../../brand';
import { findPlanGuide, planGuideFacts } from './planGuides2027';

export function planGuideJsonLd(path: string, siteUrl: string, meta: { title: string; description: string; canonical: string }): object[] {
  const guide = findPlanGuide(path);
  if (!guide) return [];
  const f = planGuideFacts(guide);
  const publisher = { '@type': 'Organization', name: PRODUCT_NAME, url: `${siteUrl}/` };
  const crumbs = [
    { name: PRODUCT_NAME, item: `${siteUrl}/` },
    { name: 'Guides', item: `${siteUrl}/guides` },
    { name: guide.navLabel, item: meta.canonical },
  ];
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: guide.h1,
      description: meta.description,
      url: meta.canonical,
      mainEntityOfPage: meta.canonical,
      inLanguage: guide.country === 'GB' ? 'en-GB' : 'en-US',
      dateModified: guide.lastChecked,
      author: publisher,
      publisher,
      image: `${siteUrl}/og-images/learn.png`,
      about: `${guide.year} ${guide.holidayWord}`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: guide.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.question,
        acceptedAnswer: { '@type': 'Answer', text: faq.answer(f) },
      })),
    },
  ];
}
