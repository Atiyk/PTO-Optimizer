/** Test-only: links whose plans were recorded from production (e28eeab) before the
 * year-round planning styles were added. Each must keep producing the same plan. */
export const LEGACY_PLAN_TODAY = '2026-11-14';

export const LEGACY_PLAN_CASES: readonly string[] = [
  // The old homepage -> /pto link (pv=2, ps=balanced) and its siblings.
  '?c=US&b=15&s=2026-11-14&e=2027-11-13&rv=0&pv=2&ps=balanced&mb=3&lp=1&w=30&count=3',
  '?c=GB&b=25&s=2026-11-14&e=2027-11-13&rv=0&pv=2&ps=balanced&mb=3&lp=1&w=30&count=3',
  '?c=DE&b=30&s=2026-11-14&e=2027-11-13&rv=0&pv=2&ps=balanced&mb=3&lp=1&w=30&count=3',
  '?c=US&b=15&s=2026-11-14&e=2027-11-13&pv=2&ps=balanced&mb=3&w=30&count=3',
  '?c=US&b=20&s=2027-01-01&e=2027-12-31&pv=2&ps=long-breaks&mb=5&rv=5',
  '?c=GB&sd=GB-SCT&b=25&s=2027-01-01&e=2027-12-31&pv=2&ps=more-breaks&mb=3',
  '?c=DE&sd=DE-BY&b=30&s=2027-01-01&e=2027-12-31&pv=2&ps=custom&mb=0&w=50&count=4',
  '?c=AU&b=20&s=2026-07-01&e=2027-06-30&pv=2&ps=balanced&mb=3',
  // Legacy links: no pv, the old optimizer semantics.
  '?c=US&b=15&s=2026-11-14&e=2027-11-13&ps=balanced',
  '?c=US&s=2027-01-01&e=2027-12-31&b=25',
  '?c=GB&sd=GB-ENG&s=2027-01-01&e=2027-12-31&b=20',
  '?c=DE&sd=DE-BE&s=2027-03-01&e=2027-10-31&b=12',
  '?c=US&s=2027-01-01&e=2027-06-30&b=10&p=2027-03-15,2027-03-16&r=2027-05-28&w=50&count=3',
  '?c=CA&s=2027-01-01&e=2027-12-31&b=10&ac=1&am=1.5&ex=1&xd=2027-12-31&cc=5',
  '?c=US&s=2028-01-01&e=2028-12-31&b=15&ww=0111110&w=30&count=3',
  '?c=US&s=2027-01-01&e=2027-12-31&b=40&objective=most-days-off',
];
