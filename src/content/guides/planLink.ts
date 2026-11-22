/**
 * Builds the "Open this plan" links in guide bodies: a 2027 US plan with these exact PTO
 * days pinned, so the planner opens on the plan the article describes. Relative, so the
 * links survive a domain move. guides.test.ts checks every pinned day is a working day.
 */
export function usPlanHref(ptoDays: readonly string[], options: { start?: string; end?: string; budget?: number; extra?: Record<string, string> } = {}): string {
  const params = new URLSearchParams({
    c: 'US',
    s: options.start ?? '2027-01-01',
    e: options.end ?? '2027-12-31',
    b: String(options.budget ?? ptoDays.length),
    pv: '2',
    ps: 'custom',
    w: '30',
    count: '0',
    mb: '3',
  });
  for (const [key, value] of Object.entries(options.extra ?? {})) params.set(key, value);
  if (ptoDays.length) params.set('p', [...ptoDays].sort().join(','));
  return `/pto?${params.toString().replace(/%2C/g, ',')}`;
}

/** Working days Monday to Friday between two ISO dates, inclusive. */
export function weekdaysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
