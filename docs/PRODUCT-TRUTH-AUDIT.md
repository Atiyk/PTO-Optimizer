# Product Truth Audit: consumer app

Date: 2026-11-05. Scope: consumer copy only (apps/teams excluded). Line numbers are for the working tree on the audit date, which includes an uncommitted brand/visual redesign that touches 59 files. No source files were edited. Claims were checked against the code, the bundled data, and solver runs (`solve`, `solveConsumer`, `computeScores` via tsx, US/GB/DE, 15 PTO days).

Status key: **V** Verified · **P** Partially supported · **C** Conditional · **M** Misleading · **U** Unsupported · **O** Outdated · **?** Unverifiable

## How the scores and travel data actually work

- **Efficiency percentile** (`packages/engine/src/solver/solve.ts:1011,1034-1038,1072-1095`). The comparison set is the plan itself plus the same input re-solved at w = 0/20/40/60/80/100, so 6 or 7 plans. The percentile is the share of those plans whose days-off-per-PTO-day ratio is no better than yours, inclusive. The default (w=30) and any w=0 plan nearly always scores **100th**: US 2027 → 100, DE → 100, GB → 71. A w=100 plan scores **17th** (1 of 6). "100th" only means no other travel weighting we tried did better. It does not mean the plan is "better than most plans at this budget".
- **Travel percentile** (`solve.ts:1042-1050,1080,1092`). This is the share of 7-day chunks *in the selected date range* whose mean demand is at least the plan's demand. Plan demand is the unweighted mean of each break's mean, so a 3-day break counts as much as a 10-day one. The population is the weeks in your dates, not "the year".
- **Demand data** (`packages/engine/src/data/demandIndex.ts:28-41`, `scripts/build-demand-index.ts:44`).
  - **US:** one year of TSA checkpoint counts, keyed by month-day (MM-DD). The weekday pattern shows the source year is **2025**: Tue/Wed/Sat low, Fri/Sun high. Because the index is keyed by calendar date and not realigned by weekday, that weekly pattern drifts in other years. In 2027 the index rates Thursdays (0.87) and Fridays (0.91) as the quietest days and Tuesdays (1.10) as the busiest, which is the reverse of real weekly patterns.
  - **Non-US:** four hard-coded constants: Dec 20–Jan 2 1.35, Jul–Aug 1.15, Mar–Apr 1.10, otherwise 1.0. They are not derived from US data, whatever data-sources.json says.
- **"Estimated" labelling.** Only break tags carry it, and only when w>0 and the mean crosses 0.85/1.25 (`solve.ts:716-724`). The summary percentiles, the exported image subtitle (`ExportBar.tsx:144-145`) and the pinned-plans strip (`PinnedPlansStrip.tsx:19`) show non-US travel percentiles with no estimate label.
- **"Popular period" notice.** `mostContestedBreakId` always returns a break (`requestDeadline.ts:78-90`), so every plan with 2 or more breaks gets "Break N falls in an estimated popular vacation period", even when every break is quiet.
- **Solver guarantee.** The solver runs a DP over enumerated candidate breaks. It maximises days off, minus w × a demand-deviation penalty, under the break-count target and minimum break length. That makes it "best" only under its own scoring. The peak-season cap is explicitly a greedy re-solve, not a joint optimum (`solve.ts:949-958`).
- **What reaches a server.** Holiday files are same-origin first, with Nager.Date as fallback (`holidays.ts:4-10,67-90`). These also send data to a server:
  - Calendar subscription feeds (`/api/feed`, `/api/watch`): the server solves the plan from the link every time the calendar app refreshes it, and the calendar provider stores the URL.
  - Email sign-in (Neon Postgres): stores the email, saved plan/policy links, the reminders flag and the last-reminded date (`server/account/db.ts:40-48`).
  - Analytics: Vercel and Plausible, route only.
  - OCR is genuinely on-device: tesseract assets are self-hosted (`scripts/ocrAssets.ts:17-21`).
- **Email reminders** are off unless env vars exist. When on, they are best-effort: a 400/day global cap (`server/account/config.ts:47`), 200 accounts per daily run (`handlers.ts:241`), and an item missed on its alarm day is not re-sent. They read the *saved link* through the server feeds, so requests tracked only in this browser are excluded.

## Claims table

| # | Claim (where) | St. | Evidence / gap | Fix |
|---|---|---|---|---|
| 1 | "Efficiency percentile … better than most plans at this budget" (SummaryMetrics.tsx:76-77; scoreFormat.ts:42-44) | M | Comparison set is ≤7 re-solves at other weightings (solve.ts:1011,1072-1095); default nearly always 100th | F1 |
| 2 | "Travel percentile (higher is quieter) … quieter than most weeks / about average for the year" (SummaryMetrics.tsx:79-80; scoreFormat.ts:47-49) | P | Population is weeks in the selected range, not the year; non-US values come from a 4-constant heuristic with no label | F2 |
| 3 | "Break N falls in an estimated popular vacation period" (App.tsx:420) | M | Shown for the highest-demand break even below the 1.25 threshold (requestDeadline.ts:78-90) | F3 |
| 4 | "uses last year's figures as a proxy for this year's patterns" (FAQ.tsx:27) | O/M | Built from 2025 for 2026–2028 plans; weekday pattern drifts by calendar date (demandIndex.json; build-demand-index.ts:44) | F4 |
| 5 | "other countries … labelled 'Estimated'" (FAQ.tsx:27; data-sources.json:20) | P | Only on break tags and only when w>0; percentiles, image subtitle and pinned strip are unlabelled | F2, F5 |
| 6 | "generic seasonal estimate, built from the same US data" (data-sources.json:20) | U | Hard-coded constants (demandIndex.ts:28-35) | F5 |
| 7 | Holidays "Fetched live from the browser on each visit" (data-sources.json:12) | O | Bundled same-origin files for 204 countries × 2026–2028 come first; Nager is the fallback (holidays.ts:5-10,72-90) | F6 |
| 8 | "busiest and most expensive weeks to travel" (FAQ.tsx:32) | U | No price data; the same FAQ says "does not predict fares" | F7 |
| 9 | "picks the best non-overlapping combination … that's what lets it beat planning it by hand" (FAQ.tsx:17) | P/? | Best only under its scoring and break-count target; "beat by hand" is untested | F8 |
| 10 | "turn 15 PTO days into 32+ days off" (pto/index.html:16,27,39) | M | Default /pto plan (balanced, 3 breaks): US Nov 5–Dec 31 2026 = 30, US 2027 = 31, GB 2027 = 31 | F9 |
| 11 | "Gapless does not send scheduled email or push notifications." (ExpirationGuard.tsx:242) | O | Contradicts EmailReminders on the same panel when accounts are on (PR #117) | F10 |
| 12 | "Gapless emails you 60, 30 and 7 days before PTO expires … stores only your email and the links you save" (EmailReminders.tsx:70,96) | C/P | Best-effort (cap, no retry); device-tracked requests excluded; also stores the reminders flag and last-reminded date | F11 |
| 13 | "Your plan stays in this browser unless you share it or turn on email reminders." (App.tsx:500) | P | Subscribing sends the plan link to /api/feed and to the calendar provider | F12 |
| 14 | "Most planning runs on your device" / "Personal PTO records are not uploaded" (privacy.html:79) | P | Saved links (balance, planned days) are uploaded on sign-in; feeds are solved server-side; no feed section | F13 |
| 15 | "Calendar exports and share images are generated on your device." (privacy.html:88) | P | True for downloads; subscription feeds are server-generated | F13 |
| 16 | "There is no account or support form to fill out." (privacy.html:115) | O | Optional accounts exist | F14 |
| 17 | Terms "updated November 3, 2026" omit accounts and email (terms.html:91,103) | O | PR #117 added sign-in, reminders and inbound email | F15 |
| 18 | Calendar feed "kept current" (SubscribeFeed.tsx:49) / "updated against today's date" (ExpirationGuard.tsx:262) | C | Re-solved from the frozen link; CDN cache up to 6 h (feedHandler.ts:33); limits of 3 years and 80 PTO days (feedHandler.ts:16-22) | F16 |
| 19 | Tag "Estimated" (solve.ts:722 → BreakCard tag chip) | P | Bare word with no subject | F17 |
| 20 | "Avoid busy travel periods" slider (WeightingSlider.tsx:42) | C | Real (if dated) US data only; elsewhere it shifts only around Dec/Jul–Aug/Mar–Apr | F18 |
| 21 | "Days I can't take off … never count against your travel or efficiency scores" (MoreOptions.tsx:310-311) | P | Efficiency sweep uses the same blackouts; the travel population still includes blacked-out weeks | F19 |
| 22 | Peak cap "The rest of your budget still gets used, just moved elsewhere" (MoreOptions.tsx:232-234) | C | Greedy re-solve; budget may stay unspent if nothing fits; pinned days can exceed the cap | F19 |
| 23 | "Free, no account needed." / "Free, and every plan works without an account." / "Free, no sign-up" (Landing.tsx:239; Footer.tsx; index.html:16; aboutFaqItems.ts:7) | V | Accounts optional and gated by env (EmailReminders.tsx:27,63) | — |
| 24 | "Public holiday data comes from Nager.Date. We assume those days are observed" (Landing.tsx:344, 267) | V | Bundled Nager snapshot; national only on landing (Landing.tsx `!holiday.counties`) | — |
| 25 | "Same inputs, same plan … Every setting lives in the link" (Landing.tsx:334-335; FAQ.tsx:42) | C | Employer calendar is in `eh` (landingState.ts:51). Plans drift if holiday data is rebuilt or the link lacks `s`/`e` (defaults to today) | low, F20 |
| 26 | "204 countries have real data" (DataSources.tsx:48) | V | 612 non-empty files = 204 × 2026–28; later years fall back to live Nager | — |
| 27 | Screenshot balance reader: "Reading happens on this device … never uploaded … about 7 MB downloads once" (BalanceReader.tsx:154) | V/P | Self-hosted tesseract ≈6.8 MB; `cacheMethod:'none'`, so "once" relies on the browser HTTP cache | F21 |
| 28 | Family photo OCR "read on your device … never uploaded" (familyFaqItems.ts:14; FamilySources.tsx) | V | familyOcr.ts:19-22 uses /ocr on same origin | — |
| 29 | "Everything stays in this page and its link. Nothing is uploaded or saved." (Family.tsx:329) | V/P | No storage or API; the URL import fetches the school's own site directly; page analytics | — |
| 30 | Partner link "includes no balance, employer, notes" (PartnerPlanner.tsx:131) | V | partner.ts:94-103 sets only the payload plus `s`/`e` | — |
| 31 | Payout: "gross employer-policy scenario", "Estimated gross payout", "Employment law is not verified here" (DeparturePayoutEstimator.tsx:53,133,159) | V | Labelled as an estimate | — |
| 32 | Carryover/forfeiture "estimates rather than employer-verified" (ExpirationGuard.tsx:198-219; QuickForecast.tsx:84,141) | V | Labelled as estimates | — |
| 33 | "no forfeiture, cap, or deadline risk in the next 18 months" (Policy.tsx:574) | P | Horizon is 18 months from `balanceAsOf`, not today (Policy.tsx:32,245) | F22 |
| 34 | "Why this plan?" breakdown, "planning estimate, not an approved leave request" (PlanExplanation.tsx:84-104) | V | Hidden when totals disagree (:78) | — |
| 35 | Break reasons "Quiet travel week — about N% less demand than an average day" (breakReason.ts:40) | P | US only; value comes from 2025 calendar-date data (see #4) | F4 |
| 36 | Sabbatical "best window … most consecutive time away" (sabbatical/index.html meta; sabbaticalFaqItems.ts:9-11) | V/P | Ranks placements by total days away within the range (sabbaticalData.ts:83,229) | — |
| 37 | Family "from 12 US district calendars" (Landing.tsx:283) | V/C | 12 presets, all for school year 2026-27 | low |
| 38 | Sign-in link "works for 30 minutes" (EmailReminders.tsx:100) | V | LOGIN_TTL 1800 s (handlers.ts:27) | — |
| 39 | Analytics "strips query strings and URL fragments" (privacy.html:99) | V | analyticsPrivacy.ts:5-13,28-35; analytics.ts:47-64 | — |
| 40 | Docs `c` default "Geolocated guess" (public/docs/index.html) | P | Browser locale region, not geolocation (geo.ts) | F23 |

## Fix list (by severity)

**High: wrong or misleading numbers**

- **F1.** Efficiency percentile.
  - `scoreFormat.ts:42-44`: change the bands to `0: 'other travel settings get more days off per PTO day'`, `1: 'some other travel settings do better'`, `2: 'no other travel setting we tried gets more days off per PTO day'`.
  - `SummaryMetrics.tsx:76-77`: change the label/short to `"Efficiency vs. other settings"`, and the body to `Compared with this plan re-solved at six other travel settings, not with every possible plan: {gloss}.`
  - Optional frontend fix: show "Best of 7" in place of a bare "100th" whenever the percentile is 100.
- **F2.** Travel percentile.
  - `scoreFormat.ts:47-49`: change the bands to `'busier than most weeks in your dates'`, `'about average for your dates'`, `'quieter than most weeks in your dates'`.
  - `SummaryMetrics.tsx:80`: change the body to `Travel demand vs. other weeks in your dates (higher is quieter): {gloss}. {US ? 'Based on 2025 US airport checkpoint counts.' : 'Seasonal estimate. No travel data for this country.'}`. This needs a `country` prop.
  - For non-US, render `ExportBar.tsx:144` and `PinnedPlansStrip.tsx:19` as `Travel (est.) 45th`.
- **F3.** `App.tsx:418-422`: render only when the chosen break passes `isContested(brk)`. Change the text to `Break {n} has the highest travel demand in this plan{US ? ', based on past US airport checkpoint counts' : ', based on a seasonal estimate'}. It reflects public travel, not your coworkers' plans.`
- **F4.** `FAQ.tsx:27`: replace with `Daily US TSA checkpoint counts from 2025 (public domain, linked below), lined up by calendar date. That measures how many people flew, not prices. Because the dates are not realigned by weekday, day-to-day differences in other years are approximate; week-to-week and seasonal differences hold up better. Other countries use a simple seasonal estimate (late December, July–August and March–April count as busier), labelled "estimated". It does not predict fares.` Data owner, not a frontend change: rebuild the index aligned by weekday-of-year.
- **F9.** `pto/index.html:16,27,39`: replace with `Free tool to plan paid time off around weekends and holidays. See exactly which days to request to turn your PTO into longer breaks — no sign-up required.` Alternatively, generate the number at build time the way `build-og-images.ts:110-115` does, using the default consumer settings.
- **F10.** `ExpirationGuard.tsx:242`: replace `Gapless does not send scheduled email or push notifications.` with `This file adds the reminders to your own calendar. For reminder emails, sign in below (optional).` If accounts are off, render `This file adds the reminders to your own calendar app.`

**Medium: privacy and data-source accuracy**

- **F5.** `data-sources.json:20`: replace with `"United States only. Other countries use a simple seasonal estimate (late December, July–August and March–April count as busier). It is not derived from travel data and is labelled \"estimated\" in the planner."` Add `"sourceYear": 2025` to the travel source.
- **F6.** `data-sources.json:11-12`:
  - accessPattern: `"Served with the site as a snapshot for 2026–2028 and cached in your browser. For other years the browser asks Nager.Date directly (country and year only)."`
  - coverage: add `"Bundled for 2026–2028."`
- **F11.** `EmailReminders.tsx:96`: replace with `Optional. Sign in with just your email and Gapless emails you {remindersText}, based on the link you save here. Requests tracked only in this browser aren't included. It stores your email, the links you save and when it last emailed you, and you can delete them in one click.` Add to the privacy page: `Reminder emails are best-effort and can be skipped on days the site reaches its email limit.`
- **F12.** `App.tsx:500`: replace with `Free, and no account needed. Your plan stays in this browser unless you share its link, subscribe to its calendar feed, or turn on email reminders.`
- **F13.** `privacy.html:79` trust line: replace with `Most planning runs on your device. No account is required. Calendar subscriptions and optional email reminders send your plan link to Gapless's server, which builds the calendar or email from it.` Add a section after :88: `<h2>Calendar subscriptions</h2><p>When you subscribe to a plan or expiry calendar, your calendar app (and its provider, such as Google, Apple or Microsoft) keeps the subscription link and fetches it regularly. Gapless's server rebuilds the calendar from the settings in that link each time; it does not store the link. Anyone with the link can see those settings.</p>` At :88, change to `Downloaded calendar files and share images are generated on your device.`
- **F14.** `privacy.html:115`: replace with `Write directly to the creator. There is no support form. Please don't include private PTO notes, salary information, or sensitive records in your email.`
- **F15.** `terms.html:91`: add `Signing in is optional and only adds reminder emails and approval forwarding. Reminder emails are best-effort and may be delayed or skipped.` Update the date.

**Low: precision and wording**

- **F7.** `FAQ.tsx:32`: replace `busiest and most expensive weeks to travel` with `often the busiest weeks to fly, in the US checkpoint data`.
- **F8.** `FAQ.tsx:17`: replace the last sentence with `It scores whole sets of breaks together, not one break at a time, so it can find combinations that are easy to miss by hand. "Best" means best for your settings: the travel slider, break count and minimum break length.`
- **F16.** `SubscribeFeed.tsx:49`: replace `kept current` with `rebuilt from this link when your calendar refreshes (usually within a day)`. `ExpirationGuard.tsx:262`: replace `updated against today's date` with `recalculated from today's date when your calendar refreshes`.
- **F17.** Render the `Estimated` tag in BreakCard as `Travel demand estimated` (display mapping only, no engine change).
- **F18.** `WeightingSlider.tsx:6` hint: append ` Outside the US this uses a rough seasonal estimate.`
- **F19.** `MoreOptions.tsx:311`: replace with `These narrow what the solver can pick. The efficiency score compares plans under the same limits.` `MoreOptions.tsx:233-234`: replace with `…turn this on if yours does. The planner moves PTO out of that window where it can; days you pinned stay put.`
- **F20.** `FAQ.tsx:42`: replace with `Yes, as long as the link includes its dates and the holiday data hasn't been updated since. That is why a shared link reproduces what the sender saw.`
- **F21.** `BalanceReader.tsx:154`: replace `downloads once` with `downloads from this site (your browser may keep a copy)`.
- **F22.** `Policy.tsx:574`: replace with `Nothing to flag: no forfeiture, cap or deadline risk in the 18 months after your balance date.`
- **F23.** `public/docs/index.html` (`c` row): replace `Geolocated guess` with `Guessed from browser language`.

Verified and needing no change: payout/carryover labelling, partner and family link contents, OCR on-device claims, analytics URL stripping, "free, no account needed", holiday source attribution, 204-country coverage, "Why this plan?" breakdown, 30-minute sign-in link.
