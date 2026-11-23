# Timebower growth metrics

Last checked 2026-11-22 against `src/ui/analytics.ts` on branch `growth/wt-analytics`.

Every statement is tagged. **Observed** means checked in this repo's code, its tests or
browser runs, or on a vendor page fetched on 2026-11-22. **Hypothesis** means a
judgement or a target that real data has not tested yet. No Timebower traffic data was
available when this was written, and the Plausible dashboard's existence and owner are
still **Unknown** (docs/growth/BASELINE.md).

> Instrumentation is not validated demand. These events count what people do on
> the site. They do not show that anyone would pay, recommend Timebower, or come back next
> year. Read every number below as "this many browsers did X", never as "this many people
> want Y".

## 1. Privacy rules (Observed, enforced by tests)

1. `track(event)` takes one argument, the event name. No properties, no IDs, no cookies,
   no fingerprinting. Tests fail if a second argument is added (`analytics.test.ts`).
2. Custom events report only `origin + pathname`. The query string and fragment, where
   every planning input lives, are removed (`sanitizeAnalyticsUrl`).
3. The **Plausible pageview** is the only payload that can carry a query string. It may
   keep `utm_source`, `utm_medium` and `utm_campaign` and nothing else, and only when the
   value:
   - appears exactly once (a key that appears twice is dropped),
   - is 1–40 characters matching `^[a-z][a-z0-9_-]*$` after lowercasing (so no `@`, `.`,
     `=`, `%`, spaces or non-ASCII characters), and
   - contains no date shape (`2027-06`, `2027-06-01`) and no run of 5 or more digits.

   `utm_term`, `utm_content`, `ref`, `source`, click IDs and every planner parameter are
   dropped. See `sanitizeCampaignPageviewUrl` and its tests in `analyticsPrivacy.test.ts`.
4. Vercel Web Analytics never receives campaign labels. `analyticsBeforeSend` rebuilds
   the payload as `{type, url: origin+pathname}`. The reason: on Vercel's Hobby plan, UTM
   reporting is not included ("UTM Parameters: –" for Hobby, available only with Web
   Analytics Plus on Pro; https://vercel.com/docs/analytics/limits-and-pricing). Sending
   the labels would expose data and give nothing back.
5. When the incoming `document.referrer` has a query string or fragment, both providers
   send nothing for that page. The page's `<meta name="referrer" content="no-referrer">`
   only affects requests the page makes; it cannot change the referrer the page arrived
   with.
6. The only browser storage analytics uses is `timebower.analytics.breakActions.v1`
   (localStorage), which lists the first-action kinds already counted, and
   `timebower.analytics.returned.v1` (sessionStorage), which holds `'0'` or `'1'`. Neither
   contains an identifier.
7. `public/privacy.html` lists every event name. A test checks that the list matches
   `ANALYTICS_EVENTS` exactly, so adding an event without disclosing it fails CI.
8. The share-link format (`src/ui/shareFormat.ts`, `sv=1`) is a compatibility contract.
   Analytics never adds parameters to links Timebower writes. Share arrivals are counted
   with `shared_link_opened`.

## 2. How attribution works (Observed in the browser run, except where marked)

- Plausible works out a visit's source from the incoming referrer domain on its own
  servers. Its docs also list `ref`, `source` and the five `utm_*` tags as recognised
  parameters (https://plausible.io/docs/stop-tracking-utm-tags). Timebower forwards only
  the three labels described above.
- The labels are read from the address the page **arrived with**. Policy, the homepage
  and the planner rewrite their own address before the pageview effect runs, so
  `PrivacyAnalytics` records the arrival URL during render (`rememberArrivalUrl`).
  `scripts/consumer-journey.mjs` checks this with the real hosted SDKs: the pageview `u` is
  `/policy/?utm_source=qa_newsletter`, and the email-shaped `utm_campaign`, the
  `utm_term`, the balance and the dates are absent from every request.
- Custom events never carry the labels. Plausible attributes them to the session's first
  pageview (**Hypothesis**, based on how Plausible sessions work; confirm once on the
  dashboard with a test visit).
- **Campaign naming convention** for anyone who posts Timebower links: lowercase, `_` or
  `-` as separators, and a year only as a plain word part. `utm_campaign=pto_2027_guide`
  passes. `utm_campaign=guide-2027-01` is dropped, because it contains a date shape.
  Example: `?utm_source=reddit&utm_medium=social&utm_campaign=pto_2027_guide`.

## 3. Event catalog and audit

Columns: where it fires, how often it can fire, and what it reveals beyond its name
(always the public path only). All Observed from code.

| Event | Fires in | Repeat behaviour | Funnel step |
| --- | --- | --- | --- |
| `quick_plan_engaged` | Landing: first edit of the quick-plan sentence | Once per page mount (ref) | Personalize |
| `landing_plan_opened` | **Not yet wired**: Landing "See the full plan" | Planned: once per click | Receive plan |
| `guide_plan_opened` | `/guides/*` links into the planner or policy tool | Planned: once per click | Receive plan |
| `meaningful_plan_interaction` | Planner: first change to country, region, dates, balance or style (`useAppState` engaged setters) | Once per document. **New**: it was declared but never fired before this change | Personalize |
| `Solve completed` | Planner: each distinct plan, **including the default plan on load** | Many per visit | Not engagement: it fires without input |
| `holiday_check_opened` | **Not yet wired**: Landing "Check company holidays" | Planned: once per document | Verify holidays |
| `holiday_preference_customized` | Each company-holiday edit (planner and landing profile) | Every edit, can repeat many times | Verify holidays |
| `team_days_used` | Planner: overlap days first non-empty | Once per mount | Take action |
| `plan_saved` | Planner "Save this plan" | Every save | Take action |
| `first_break_saved` / `_tracked` / `_exported` / `_shared` | App save, mark requested, RequestPanel per-break .ics, partner share | Once per browser per kind (localStorage) | Take action |
| `second_meaningful_break_action` | Second distinct kind above | Once per browser | Take action (depth) |
| `request_text_copied` | **Not yet wired**: RequestPanel and ReturningDashboard copy buttons | Planned: every successful copy | Take action |
| `request_tracking_started` | Planner mark requested; My PTO tracker | Per request | Take action |
| `request_status_updated` | My PTO status change | Per change | Take action |
| `ICS downloaded` | ExportBar, PartnerPlanner | Per click. RequestPanel's per-break .ics does **not** send this (only `first_break_exported`) | Take action |
| `feed_subscribed` | SubscribeFeed calendar app links and copy | Per click | Take action |
| `Image copied` | ExportBar image (clipboard or download fallback) | Per success | Take action |
| `portrait_image_exported` | PortraitShare | Per success | Take action |
| `URL shared` | ExportBar "Copy plan link" (this is the plan-link copy; no `plan_link_copied` event was added) | Per success | Share |
| `shared_link_opened` | Planner arrival with `sv=1` | Once per document | Share loop |
| `shared_plan_made_own` | **Not yet wired**: SharedPlanNotice "make it my own" action | Planned: once per document | Share loop |
| `Overlap link opened` | Planner arrival with an overlap payload | Once per mount | Share loop |
| `partner_share_generated` / `partner_proposal_generated` | PartnerPlanner copy | Per copy | Share |
| `partner_share_opened` | PartnerPlanner received availability | Once per document | Share loop |
| `family_*` (5) | Family page actions and arrival | Per action; `family_share_opened` once per mount | Side tool |
| `balance_forecast_used`, `expiration_alert_*`, `policy_*`, `term_opened`, `paragraph_decoded` | Policy and glossary | Per action. `paragraph_decoded` fires on **every keystroke** that decodes | Side tool |
| `returned_with_saved_url` | Planner mount | At most once per tab session, and only if the tab's first planner document is a genuine return. **Fixed**: before, a reload or leaving /pto and coming back in the same visit counted | Return |

### Known gaps and caveats (Observed)

- Homepage returns are not counted. `ReturningDashboard` renders for people with a saved
  plan or request, but only the planner calls `trackReturnOncePerSession`.
- `first_break_exported` counts only RequestPanel's per-break .ics. The whole-plan
  "Download once (.ics)" sends `ICS downloaded` but never the milestone, and copying a plan
  link never counts as `first_break_shared`. The second-action milestone therefore
  undercounts.
- Count `holiday_preference_customized` and `paragraph_decoded` as **unique visitors**
  (Plausible's goal conversion), never as totals.
- Under React StrictMode, which runs only in development, once-per-mount events fire
  twice. Production builds are not affected.
- Plausible sessions end after 30 minutes of inactivity (**Hypothesis**: Plausible's
  documented default, not re-checked today). Ours is a tab session, so the two "return"
  notions differ. Treat `returned_with_saved_url` as "came back to a kept plan in a new tab
  or visit".

## 4. Funnel and north star

**North star (Hypothesis that it is the right one):** weekly unique visitors who complete
a *plan action*, meaning they reach at least one of the Plausible goals `request_text_copied`,
`request_tracking_started`, `ICS downloaded`, `feed_subscribed`, `URL shared`, `plan_saved`
or `first_break_exported`. Why: these are the moments Timebower's output leaves the page
and enters someone's calendar, inbox or a conversation with their manager.

All rates below use Plausible **unique visitors** over a 7-day window. Plausible counts a
visitor once per goal per day and rotates its daily visitor hash, so a "weekly unique" is
an approximation (**Hypothesis**; check Plausible's docs on unique visitors before quoting
it exactly).

| Step | Numerator (unique visitors with…) | Denominator | Tool |
| --- | --- | --- | --- |
| Visit | pageview on `/`, `/pto*`, `/guides/*` (filter by page) | — | Plausible Pages, Sources, Campaigns |
| Personalize | `quick_plan_engaged` OR `meaningful_plan_interaction` | Visit | Plausible goals |
| Receive plan | `landing_plan_opened` OR `guide_plan_opened` OR pageview `/pto` | Visit on `/` or `/guides/*` | Plausible funnel (Business plan) or goal conversion rate filtered by entry page |
| Verify holidays | `holiday_check_opened` OR `holiday_preference_customized` | Receive plan | Plausible goals |
| Take action (north star) | any plan-action goal above | Receive plan | Plausible goals |
| Share | `URL shared`, `partner_share_generated`, `Image copied`, `portrait_image_exported` | Take action | Plausible goals |
| Share loop | `shared_link_opened` → `shared_plan_made_own` | `URL shared` (ratio of totals, not a per-person link) | Plausible goals |
| Return | `returned_with_saved_url` | `plan_saved` + `first_break_saved`, previous 4 weeks (cohort-free ratio, **Hypothesis** proxy) | Plausible goals |

Acquisition: break every step down by Plausible's Sources, and by Campaigns for links
tagged with `utm_*`. Guide pages are identified by their `/guides/...` path. No extra event
is needed for page type.

Vercel Web Analytics on Hobby collects pageviews only (no custom events; 50,000 events a
month shared across projects; 1-month reporting window). Use it as a second check on
pageview totals and Core Web Vitals. Do not use it for funnels
(https://vercel.com/docs/analytics/limits-and-pricing, Observed).

## 5. Plausible setup the owner must do

Plan limits (Observed on https://plausible.io/#pricing and the docs, 2026-11-22):

- **Starter, $9/month, one site:** goals and custom events. No funnels and no custom
  properties.
- **Growth, $14/month, up to 3 sites:** everything in Starter. Funnels are not listed.
- **Business, $19/month, up to 10 sites:** adds "Funnels and user journeys" and "Custom
  Properties". The docs say "Funnel analysis is a Business plan feature", with 2–8 steps
  per funnel and sequential, flexible or strict ordering
  (https://plausible.io/docs/funnel-analysis). Custom properties are also Business-only
  (https://plausible.io/docs/custom-props/introduction). Timebower does not need them: it
  sends no properties, by design.
- Prices are for the smallest pageview tier and change with volume. Check them again
  before buying.

Steps:

1. Confirm who owns the Plausible site for `pto-optimizer-seven.vercel.app` (the
   `data-domain` in every consumer HTML entry). If nobody does, create it. Creating an
   account is the owner's job.
2. Site settings → Goals → add a **custom event goal** for each name in
   `ANALYTICS_EVENTS`, spelled exactly, including the capitals and spaces in
   `Solve completed`, `ICS downloaded`, `Image copied`, `URL shared` and
   `Overlap link opened`. Plausible does not record custom events without a matching goal.
3. Add **pageview goals** for `/pto*` and `/guides/*` (wildcard) so they can be funnel steps.
4. On Business only: create funnel "Plan to action": pageview `/` or `/guides/*` → `quick_plan_engaged`
   → `landing_plan_opened` → `meaningful_plan_interaction` → (any plan-action goal; pick
   `request_text_copied` for the stricter version). Use the sequential type. On
   Starter/Growth, read each goal's conversion rate with an entry-page filter instead.
5. Test it: open `/?utm_source=qa_check&utm_medium=test` in a private window, take one
   plan action, then check that Campaigns shows `qa_check` and the goal shows one visitor.
   This verifies the session-attribution hypothesis in section 2.

## 6. Weekly review (30 minutes, Mondays)

1. Write down the visits, the north-star count and its rate, with no commentary. Keep a
   running table in this file or a sheet.
2. Look at the funnel step with the largest relative drop compared with last week.
   Change one thing about that step at most.
3. Sources and Campaigns: which source brought the most visitors who reached the north
   star, not the most pageviews.
4. Share loop: compare `shared_link_opened` with `URL shared`. A ratio below about 0.3
   suggests links are copied but not sent (**Hypothesis** threshold).
5. Returns: `returned_with_saved_url` trend. It is seasonal (PTO planning peaks around
   year-end and January), so compare against the same weeks last year once there is a
   year of data.
6. Write a one-line decision and its owner. If nothing changed, write "no change". Don't
   redesign because of a single week's noise. With small numbers (under ~100 visitors a
   step), treat any change under 2× as noise (**Hypothesis** rule of thumb).

## 7. Leading indicators that would justify more investment (all Hypothesis)

These are thresholds to argue over, not facts. Each needs at least 8 consecutive weeks
before a decision. "Unique visitors" means Plausible's count.

- **Monetization research** (interviews, a pricing page test; not a paywall): 1,000 or more
  weekly visitors, a north-star rate of 15% or more of planner visitors, AND
  `second_meaningful_break_action` at 25% or more of `first_break_saved`. Depth of use
  matters more than reach.
- **Reminders or accounts depth:** `returned_with_saved_url` at 20% or more of the
  previous month's `plan_saved` + `first_break_saved`, and `feed_subscribed` growing.
- **A native app:** only if returns are strong (above) AND mobile is more than 60% of
  north-star visitors in Plausible's device report AND `feed_subscribed` /
  `ICS downloaded` show that people want the plan to live outside the browser. The PWA
  already covers install, so the app would need a reason the PWA can't meet (for
  example widgets or push notifications).
- **Stop signals:** a north-star rate under 5% after 8 weeks of steady traffic, or a share
  loop ratio near 0. Fix the core plan before adding surfaces.

## 8. Changing events

- Add the name to `ANALYTICS_EVENTS` with a one-line comment, and to the list on
  `public/privacy.html`. The catalog test fails until both match. Add the Plausible goal.
- Never rename an existing event. Goals and history depend on the names. Add a new
  one and retire the old one in this file.
- Never add a property, an ID, a date, a balance, an employer or policy value, or a full
  planning URL.
