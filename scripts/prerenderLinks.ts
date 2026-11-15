/**
 * Static HTML is built once and served for weeks. The landing page's planner links carry
 * the plan range the build computed from the build day (`s=<build date>&e=<build date + 1y>`),
 * so a crawler, or anyone who opens the page before scripts run, would be sent to a plan
 * that starts on the build day. A link without `s`/`e` gets the fresh-visit defaults
 * (today to a year from today) computed when /pto opens, so this drops them.
 *
 * Only links whose start is the build day are touched: a range someone chose on purpose
 * would never be written into prerendered markup, but it is left alone if it ever is.
 * Every other parameter (country, budget, style, holiday focus, pins) is kept, and the
 * planner already ignores a focus date or pinned day that falls outside the range.
 *
 * After hydration React keeps a server attribute it would have written differently, so a
 * visitor whose day matches the build keeps the date-free link (same plan), and on any
 * other day the client re-renders the dated text and writes links for that day.
 */
const PLAN_HREF = /href="(\/pto\/?\?[^"#]*)(#[^"]*)?"/g;

export function freshPlanLinks(html: string, renderedDate: string): string {
  return html.replace(PLAN_HREF, (whole, pathAndQuery: string, hash: string | undefined) => {
    const [path, rawQuery] = pathAndQuery.split('?');
    const params = new URLSearchParams(rawQuery.replace(/&amp;/g, '&'));
    if (params.get('s') !== renderedDate) return whole;
    params.delete('s');
    params.delete('e');
    const query = params.toString().replace(/&/g, '&amp;');
    return `href="${path}${query ? `?${query}` : ''}${hash ?? ''}"`;
  });
}
