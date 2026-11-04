import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FAQ, ITEMS } from './FAQ';
import { FaqPage } from './FaqPage';
import { SABBATICAL_FAQ_ITEMS } from './sabbaticalFaqItems';
import { ABOUT_FAQ_ITEMS } from './aboutFaqItems';
import { FAMILY_FAQ_ITEMS } from './familyFaqItems';

const escapeHtml = (text: string) => text
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#x27;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

describe('consumer FAQ disclosure accessibility', () => {
  it('keeps every inline FAQ answer in server-rendered HTML with a native summary and visible affordance', () => {
    const html = renderToStaticMarkup(<FAQ />);
    expect(html.match(/<details\b/g)).toHaveLength(ITEMS.length);
    expect(html.match(/<summary\b/g)).toHaveLength(ITEMS.length);
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(ITEMS.length);
    expect(html).toContain('focus-visible:outline-2');
    for (const item of ITEMS) {
      expect(html).toContain(escapeHtml(item.question));
      expect(html).toContain(escapeHtml(item.answer));
    }
  });

  it('renders all four anchored FAQ sections, with wrapping touch-sized navigation', () => {
    const html = renderToStaticMarkup(<FaqPage />);
    const count = ITEMS.length + SABBATICAL_FAQ_ITEMS.length + FAMILY_FAQ_ITEMS.length + ABOUT_FAQ_ITEMS.length;
    expect(html.match(/<details\b/g)).toHaveLength(count);
    expect(html.match(/<summary\b/g)).toHaveLength(count);
    expect(html).toContain('aria-label="FAQ sections"');
    expect(html).toContain('flex-wrap');
    for (const id of ['pto', 'sabbatical', 'family', 'about']) {
      expect(html).toContain(`href="#${id}"`);
      expect(html).toContain(`id="${id}"`);
    }
    expect(html.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(count + 4);
  });
});
