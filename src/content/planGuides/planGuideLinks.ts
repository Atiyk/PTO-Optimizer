/**
 * Plain-data links to the worked-plan guides, for pages that list them without paying for
 * the solver: the /guides index (src/ui/GuidesIndex.tsx) and vite.config.ts (build inputs).
 * planGuideLinks.test.ts keeps this list in step with planGuides2027.ts (path, heading and
 * "Last checked" date) and the related-guide labels in step with src/content/guides.
 */
export interface PlanGuideLink {
  /** The page's path, /guides/<slug>. */
  href: string;
  /** The page's H1. */
  title: string;
  /** One sentence for the index. No numbers: those live on the page, computed. */
  blurb: string;
  /** The page's "Last checked" date (ISO). */
  updated: string;
}

export const PLAN_GUIDE_LINKS: readonly PlanGuideLink[] = [
  { href: '/guides/10-pto-days-2027', title: 'How to maximize 10 PTO days in 2027', blurb: 'One PTO day beside each holiday weekend, the six-holiday version, and a plan with one long break.', updated: '2026-11-22' },
  { href: '/guides/15-pto-days-2027', title: 'How to maximize 15 PTO days in 2027', blurb: 'A year-round plan with long weekends and two longer breaks, the exact dates, and a six-holiday version.', updated: '2026-11-22' },
  { href: '/guides/long-weekends-2027', title: '2027 long weekends', blurb: 'Every 2027 US federal holiday by weekday, and the one PTO day that turns each into four days off.', updated: '2026-11-22' },
  { href: '/guides/four-day-week-2027', title: 'Planning 2027 on a four-day work week', blurb: 'For a Monday-to-Thursday week: which holidays land on your Friday off, and the dates to request.', updated: '2026-11-22' },
  { href: '/guides/uk-annual-leave-2027', title: 'Making 25 days of leave go further in 2027', blurb: 'The 8 bank holidays in England and Wales, with Easter and Christmas plans for 25 or 20 days of leave.', updated: '2026-11-22' },
];

/** The hand-written guides each worked-plan page links to. Each label is the start of that
 * guide's own title, before its colon (checked by planGuideLinks.test.ts). */
export const RELATED_GUIDE_LINKS: readonly { href: string; label: string }[] = [
  { href: '/guides/maximize-pto-2027', label: 'How to maximize PTO in 2027' },
  { href: '/guides/summer-2027-long-weekends', label: 'Summer 2027 long weekends' },
  { href: '/guides/thanksgiving-christmas-2027-pto', label: 'Thanksgiving, Christmas and New Year’s 2027' },
  { href: '/guides/how-to-ask-for-time-off', label: 'How to ask for time off' },
];
