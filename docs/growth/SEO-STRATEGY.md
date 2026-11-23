# Timebower SEO and organic distribution — 2026-11-22

Owner: growth agent B (SEO). Branch `growth/wt-seo`. Each line is **Observed** (checked in this
worktree's build or against an official source on 2026-11-22) unless marked **Inferred** or
**Proposed**. No search volumes are claimed anywhere in this document or on the pages.

## 1. Audit findings (Observed, `dist/` from `npm run build` on this branch)

| Check | Finding | Action |
| --- | --- | --- |
| Titles | 52 sitemap URLs, no duplicate `<title>` across `dist/**/*.html`. | None. |
| Descriptions | No duplicate meta descriptions. | None. |
| Canonicals | Every HTML page has a canonical except `404.html`, which has `noindex`. | None. |
| robots.txt | `Allow: /` plus the sitemap line. Nothing is blocked. | None. |
| 404 | `public/404.html` has `<meta name="robots" content="noindex">`. | None. |
| Sitemap `lastmod` | None before this branch. Build-date `lastmod` would claim a change on every deploy. | Added `<lastmod>` only for the 6 guides, from each guide's `lastChecked` date. |
| hreflang | Not needed: one language. The UK guide sets `lang="en-GB"`. | None. |
| Structured data | Every app route ships `WebApplication` with `applicationCategory: "BusinessApplication"`. For a consumer planner, `LifestyleApplication` or `UtilitiesApplication` would describe it better. This is a judgment call, so I did not change it. | Owner decision. |
| Structured data | `/pto` and all six country routes ship the **same** FAQPage (the /pto FAQ). Seven pages with the same FAQ markup. | Proposed: put the FAQPage on `/pto` and `/faq` only. Not changed (prerender behaviour outside the guides). |
| Country titles | `/uk` is titled "UK Bank Holidays 2027", and `/canada`, `/germany` and `/india` are titled similarly. These become stale in 2028 unless someone edits them. | Proposed: yearly review (section 5). |
| `/uk` accuracy | `/uk` opens with no region. Without a region the planner counts 6 GB-wide days and leaves out Easter Monday and the August bank holiday for England and Wales (`holidayData2027.test.ts` proves this). A page titled "UK Bank Holidays 2027" therefore shows a plan that is missing 2 of England's 8. | Owner decision. The guide avoids the problem with `sd=GB-ENG`. |
| Prerender link rewrite | `freshPlanLinks` strips `s`/`e` from any `/pto?` link whose start equals the build day. A build on 2027-01-01 would have broken the guides' fixed-range links. | Fixed for guides: prerender skips the rewrite for `component: 'guide'`. |
| vite preview | `vite preview` serves directory pages only with a trailing slash (`/2027/` works, `/2027` falls back to the homepage; the same is true for `/glossary/<id>` and `/pto?…`). Vercel `cleanUrls` serves both. Preview-only. | QA used trailing slashes. |
| Holiday data vs official sources | US 2027 (OPM) and England and Wales 2027 (gov.uk `bank-holidays.json`) match the committed data exactly, including New Year's Day 2028 observed Fri Dec 31, 2027 (in `US-2028.json`, picked up through `consumerHolidayLookupEnd`). | Tests in `src/content/guides/holidayData2027.test.ts`. |
| Holiday data discrepancy (not used by any guide) | Nager's `GB-2027.json` lists Scotland's "2 January" on Sat 2027-01-02. gov.uk gives the substitute day **Mon 2027-01-04**. | Reported, not patched (engine/data change). |
| Dist baseline | `npm run verify:dist` already differed from `scripts/days-off-dist.sha256` on the untouched branch (115 files), before any change here. | Baseline rewritten with `--write` after this branch's build (753 files). |

## 2. Search intent (no volumes)

Evidence available today: US Google autocomplete, observed by the coordinator on 2026-11-22.
It suggested "maximize pto 2027", "best days to take off 2027", "pto 2027", "2027 pto calendar",
"pto planner 2027", "how to ask for pto" and "pto request email template". "Bridge days" is not a
US phrase, so the pages never use it as a heading.
What would confirm or kill each page: Search Console queries and impressions per URL after
launch (Search Console is not verified yet: see BASELINE.md "External blockers").

| Page | Intent it answers | Why this page and not another |
| --- | --- | --- |
| `/2027` | "best days to take off 2027", "2027 pto calendar" | Hub. It lists every 2027 federal date by weekday and the PTO day that extends each one. It has the full 15-day plan and links to every child. |
| `/2027/10-pto-days` | "maximize pto 2027" with a small balance | The answer differs by balance. With 10 days, a long weekend beside every holiday wins on the total. |
| `/2027/15-pto-days` | same, with the most common default on the homepage | With 15 days the plan can also include one or two longer breaks. The page shows that trade-off. |
| `/2027/long-weekends` | "2027 long weekends", "three day weekends 2027" (**Inferred** phrasing) | A holiday-by-holiday table, separate from any budget. |
| `/2027/four-day-week` | 4x10 workers | The engine's `ww` param gives a correct, reproducible plan (parity-tested). Four holidays fall on the Friday off. |
| `/2027/uk-annual-leave` | UK readers: "annual leave 2027", "bank holidays 2027" | The slug avoids competing with `/uk` (which owns "UK bank holidays 2027"). The page is scoped to England and Wales via `sd=GB-ENG`. |

Deferred: a "How to ask for PTO: request email template" evergreen page (strong intent, and no
competitor has one according to the coordinator's research). It needs the request-text
generator's output for a worked example and a design for linking into the request panel. That
is a separate, careful page, not a seventh rushed one. 20-PTO-day page: optional, skipped for
quality within the cap.

## 3. The pages and what they show (all computed at render)

Every number comes from `src/content/guides/guidePlan.ts`:
holidays come from `consumerHolidaysFromSource` and `holidayEntriesFor` (a new visitor's
calendar); the plan from `computeLandingPlanWith` (the homepage solver call plus style and work
week); the link from `landingPlanHref` plus `ps`/`w`/`count`, `ww`, `sd` and, for the
six-holiday versions, the planner's existing `eh` (link-carried employer calendar) parameter.
`eh` carries only public holiday names our page chose to skip. It never reads or writes the
visitor's saved calendar: `useAppState` treats a link calendar as "sent" and protects the saved
one. The range is fixed to Jan 1 to Dec 31, 2027, so prerendered content does not go stale
against "today".

The six-holiday list (New Year's Day, Memorial Day, Independence Day, Labor Day, Thanksgiving,
Christmas) is labelled on every page as an illustrative example, not an average. I could not
verify a BLS figure for paid holidays: the paid-holidays factsheet URL returned 404.

## 4. Content QA checklist (run for every new or edited guide)

1. Dates: add or extend a dated test like `holidayData2027.test.ts` against the official source
   (OPM, gov.uk JSON or the country's government page). If the data disagrees, report it; do not
   patch it in the guide.
2. Every number in the copy is a template value from `GuideFacts`, never typed by hand. Claims
   that are not plain numbers (for example "all on a Monday, Thursday or Friday") get an assertion
   in `guides2027.test.ts` → "claims the copy makes".
3. `guidePlannerParity.test.tsx` passes. It checks each plan's breaks, PTO days charged and
   total against `useAppState` at the page's own link, and against `planFromSearch`.
4. Article copy is 400 to 900 words, with 3 to 5 FAQs of 60 words or fewer each
   (`GuidePage.test.tsx`, `guides2027.test.ts`).
5. Vocabulary: "days off" and "PTO days" as in docs/VOCABULARY.md. The UK page alone uses
   "annual leave", once in its definition and in its title. Test-enforced.
6. The employer-holiday assumption sits next to the numbers. No unsourced statistics.
7. `npx tsx --tsconfig tsconfig.app.json scripts/generate-guide-html.ts`, then commit `2027/**`
   (`guideHeads.test.ts` fails on a stale shell).
8. Build, then check `dist/2027/**/index.html` for the content, title, canonical, JSON-LD and the
   CTA `href`. With JS disabled the page must still show all of it.

## 5. Adding a year or a country

1. Commit the holiday files and add them to `src/content/guides/guideHolidays.ts`: the year and
   the next year (for observed Dec 31 days).
2. Add a `Guide` entry (in a new `guides2028.ts`, exported through `GUIDES`): path, year,
   country, optional `subdivision` and `workWeek`, budget, plans, copy functions, FAQs,
   `lastChecked`, sources.
3. Add the dated holiday test (checklist item 1). `guides2027.test.ts` already fails when a
   guide's year has no holiday file or a plan comes back empty.
4. Generate the HTML shells (checklist item 7). `routes.ts` (prerender and sitemap) picks the
   entries up from `GUIDES`, and `vite.config.ts` reads them from `2027/**` on disk. For a new top
   folder, add it to the `GUIDE_HTML_FILES` glob in `vite.config.ts`.
5. Update `src/ui/guideLinkList.ts` (test-enforced to match `GUIDES`) and `public/llms.txt`.
6. Each November: review the country route titles ("… 2027") and the hub's dated 2026 year-end
   section, which should be removed or rolled forward after December 31, 2026.

## 6. Internal linking map

- Footer (every page) → `/2027` ("Best days to take off in 2027").
- `public/llms.txt` → all six guides.
- Hub `/2027` ↔ every child, through the breadcrumb and the guides list on every page.
- `/2027/10-pto-days` and `/2027/15-pto-days` → `/2027` for holiday names and weekdays.
- Every guide → `/pto` (one primary CTA plus secondary plan links), `/policy`, `/faq`,
  `/data-sources`. The hub's 2026 year-end section → `/policy`.
- Homepage: **not edited** (another agent owns `Landing.tsx`). Ready to place:
  `Guides2027Links` from `src/ui/GuideLinks.tsx`, or the data `GUIDE_LINKS_2027` from
  `src/ui/guideLinkList.ts` (no solver import).

## 7. Measurement plan

- `track('guide_plan_opened')` on every "Open this plan / version" link (event name only,
  sanitized path; it obeys the same privacy rules as every other event). Proposed metric: guide
  pageviews and the share of them that fire `guide_plan_opened`, both in Plausible per path.
- Search Console after verification: queries, impressions and CTR per guide URL. Review at 4 and
  12 weeks after the first indexed deploy. Pages with no impressions by week 12 get rewritten or
  folded into the hub.
- Not possible today: acquisition source (UTM is stripped by design), and whether a Plausible
  dashboard exists (BASELINE.md).

## 8. Deferred

- The request-email template page (section 2).
- Per-guide OG images: all guides reuse `og-images/learn.png`. `scripts/build-og-images.ts`
  regenerates every image from today's data, which would churn the existing images.
- The FAQPage de-duplication on app routes, the `applicationCategory` choice and the `/uk`
  default-region question (section 1).
- Scotland and Northern Ireland guides (Scotland's 2 January data issue first).
