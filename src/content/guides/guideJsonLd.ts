/**
 * Structured data for a guide page, built from the same config and computed facts the page
 * renders (so the FAQPage answers are the visible answers, word for word).
 */
import { PRODUCT_NAME } from '../../brand';
import { GUIDE_HUB, findGuide, guideFacts } from './guides2027';

export function guideJsonLd(path: string, siteUrl: string, meta: { title: string; description: string; canonical: string }): object[] {
  const guide = findGuide(path);
  if (!guide) return [];
  const f = guideFacts(guide);
  const publisher = { '@type': 'Organization', name: PRODUCT_NAME, url: `${siteUrl}/` };
  const crumbs = [
    { name: PRODUCT_NAME, item: `${siteUrl}/` },
    { name: '2027 guides', item: `${siteUrl}${GUIDE_HUB.path}` },
    ...(guide === GUIDE_HUB ? [] : [{ name: guide.navLabel, item: meta.canonical }]),
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
