/**
 * A long-form guide served at /guides/<id>. Content only: every number in a guide must be
 * one the engine reproduces (guides.test.ts checks each "Open this plan" link against the
 * bundled holiday data), and the body is a small Markdown subset rendered by markdown.tsx.
 */
export interface GuideFaq {
  question: string;
  /** 20 to 60 words: short enough to quote whole, long enough to stand alone. */
  answer: string;
}

export interface GuideSource {
  label: string;
  url: string;
}

export interface Guide {
  /** URL slug: /guides/<id>. Never rename a published one; links and search results point at it. */
  id: string;
  /** The page's H1. */
  title: string;
  /** The <title> tag, before " — Timebower". Keyword first, under ~60 characters. */
  metaTitle: string;
  /** Meta description, 120 to 160 characters. */
  description: string;
  /** Answer-first summary under the H1, 30 to 70 words. */
  summary: string;
  /** ISO dates. `updated` is shown on the page and written to the sitemap and Article JSON-LD. */
  published: string;
  updated: string;
  /** The country the guide's dates apply to. */
  country: 'US';
  /** For a state guide, the state's name and subdivision code (planner `sd`). */
  state?: { name: string; code: string };
  /** Which list the /guides index shows it in. */
  group: 'plan' | 'basics' | 'state';
  /** Body in the Markdown subset documented in markdown.tsx. */
  body: string;
  faq: readonly GuideFaq[];
  sources: readonly GuideSource[];
  /** The one action at the end and in the sidebar. */
  action: { href: string; label: string };
  related: readonly string[];
}
