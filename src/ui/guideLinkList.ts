/** Links into the 2027 guides (footer, homepage, src/ui/GuideLinks.tsx). Plain data: no
 * guide config or solver import. guideLinks.test.ts keeps it in step with guides2027.ts. */
export const GUIDES_2027_HUB = { href: '/2027', label: 'Best days to take off in 2027' } as const;

export const GUIDE_LINKS_2027: readonly { href: string; label: string }[] = [
  GUIDES_2027_HUB,
  { href: '/2027/10-pto-days', label: 'How to use 10 PTO days in 2027' },
  { href: '/2027/15-pto-days', label: 'How to use 15 PTO days in 2027' },
  { href: '/2027/long-weekends', label: '2027 long weekends' },
  { href: '/2027/four-day-week', label: 'A four-day work week in 2027' },
  { href: '/2027/uk-annual-leave', label: '25 days of leave in England and Wales, 2027' },
];
