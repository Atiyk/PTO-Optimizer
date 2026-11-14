import { describe, expect, it } from 'vitest';
import { freshPlanLinks } from './prerenderLinks';

describe('freshPlanLinks', () => {
  const BUILT = '2026-11-14';

  it('drops the build-day range from planner links and keeps everything else', () => {
    const html = '<a href="/pto?c=US&amp;b=15&amp;s=2026-11-14&amp;e=2027-11-13&amp;rv=0&amp;pv=2&amp;ps=balanced&amp;mb=3&amp;lp=1&amp;w=30&amp;count=3&amp;hd=2026-12-25#holiday-focus">Plan</a>';
    expect(freshPlanLinks(html, BUILT)).toBe('<a href="/pto?c=US&amp;b=15&amp;rv=0&amp;pv=2&amp;ps=balanced&amp;mb=3&amp;lp=1&amp;w=30&amp;count=3&amp;hd=2026-12-25#holiday-focus">Plan</a>');
  });

  it('leaves links with another start date, other pages and plain text alone', () => {
    const html = '<a href="/pto?c=US&amp;s=2027-01-01&amp;e=2027-12-31">x</a><a href="/policy?s=2026-11-14">y</a> s=2026-11-14';
    expect(freshPlanLinks(html, BUILT)).toBe(html);
  });
});
