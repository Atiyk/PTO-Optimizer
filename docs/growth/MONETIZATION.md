# Timebower: monetization options and costs

Written 2026-11-22 for the launch-readiness branch. Read with `docs/growth/BASELINE.md` and
`docs/growth/APP-AND-DOMAIN-READINESS.md`. Nothing was signed up for, applied to, or bought.

Labels: **Observed** (repo, live site or public lookup, 2026-11-22), **Source-backed** (official
page in §8, accessed 2026-11-22), **Hypothesis** (untested), **Unknown**.

---

## 1. Summary

1. **Stay free and non-commercial until behaviour data exists.** BASELINE records no users,
   testimonials or ratings (Observed). Any revenue figure today is a guess.
2. **Hosting blocks monetization today.** Vercel's Terms limit Hobby to "personal or non-commercial
   use" (Source-backed, Terms §4, updated 19 Oct 2026). Affiliate links, a paid tier or sponsorships
   would mean moving to Pro: **$20 per developer seat per month** (Source-backed). See §6.
3. **Analytics isn't free either.** Plausible has no free plan. After a 30-day trial the dashboard
   locks and collection stops (Source-backed). Whether this site has a paid subscription is
   **Unknown**. If it doesn't, the funnel events that every experiment below depends on are being
   lost.
4. **Ranked by fit (Hypothesis):** (1) keep planning free; (2) the B2B `apps/teams` product is where
   repeat willingness to pay most plausibly sits; (3) travel affiliate links only after a
   non-affiliate click test proves travel intent; (4) a consumer premium tier is weakest, because
   the core need recurs about once a year.

---

## 2. Options evaluated

Each row's cells are Hypothesis unless labelled otherwise.

| Option | What the customer pays for | Repeat need | Conversion friction | Ops complexity | Privacy | Ongoing cost |
| --- | --- | --- | --- | --- | --- | --- |
| **Free planning (status quo)** | Nothing | Yearly (new holidays), plus ad-hoc requests | None | Low; already built | Best: local-first, no account (Observed) | Hosting plus analytics (§6) |
| **Travel affiliate referrals** | Nothing. The travel site pays a share of a completed booking | Each planned break could lead to a trip | High: the user must click through **and** book within the cookie window (Expedia 7 days, Skyscanner 30 days, Source-backed), but PTO is often planned months ahead | Medium: network sign-up, link building, disclosure copy, reconciliation | Passing dates and a destination to a third party, with an affiliate ID | Vercel Pro required; the affiliate network may need tax forms (Unknown) |
| **Consumer premium** (e.g. more reminders, multi-calendar sync, family/partner plans, policy tracking across years) | Convenience over a year | Weak: planning peaks once a year; reminders are already free (Observed: `api/remind.ts`) | High: account plus payment, which conflicts with the repo rule "accounts optional" (Observed, CLAUDE.md via BASELINE) | High: payments, refunds, tax/VAT, entitlement checks, support | Payments add billing PII | Pro, a payment processor's fees (Unknown), support time |
| **Partnerships** (HR/benefits newsletters, employee-perk platforms, employers sharing the link) | The partner pays for content or a co-branded page, or nothing (distribution swap) | Seasonal (Nov to Jan holiday publication, Q4 "use it or lose it") | Medium: outreach is needed, which is out of scope here | Low to medium | Fine if the partner only gets a link, never user data | Time; Pro if paid |
| **B2B employer/team product** (`apps/teams`, "Days Off for Teams", Observed) | Leave tracking, balances, approvals, coverage for an org | Strong: monthly, every employee | Sales cycle, security review, SSO expectations | High, and already a separate codebase with tenant isolation rules (Observed, `apps/teams/CLAUDE.md`) | Org data and employee leave records. Its own rules say no health data (Observed) | Its own hosting. It builds as the Vercel project `leave_management` on the same pushes (Observed, BASELINE) |

### 2.1 Travel affiliate programmes (Source-backed unless marked)

| Programme | Network / sign-up | Commission (as published) | Cookie window | Entry bar |
| --- | --- | --- | --- | --- |
| Booking.com Affiliate Partner Programme | Registration via CJ; "free and easy" | Official page gives **no rate**. Secondary sources say 25 to 40% of Booking.com's own commission, tiered by volume. **Unverified** (Hypothesis) | Not stated (Unknown) | Not stated (Unknown) |
| Expedia Group Travel Creator Programme | Expedia's own hub; "Join for free" | "**Up to 4%** on every eligible booking"; current rates only after login | 7 days (help-centre commission terms, via search; Source-backed but not opened directly) | Not stated |
| Skyscanner Affiliates | Impact.com | Share of Skyscanner's revenue from the supplier, performance-tiered; no public % | 30 days | "**More than 5,000 unique visitors per month**", HTTPS, travel content. Coupon/cashback/network partners excluded |

Implications (Hypothesis):

- Timebower would likely **fail Skyscanner's traffic bar today**.
- The commission per booking is small, a few dollars to low tens, and the cookie window is short
  next to PTO lead times.
- **Privacy:** a deep link carrying `checkin`/`checkout` and a country tells the travel site and the
  affiliate network the user's planned absence. The site sets `no-referrer` (Observed), but query
  parameters in the outbound URL go anyway. Any implementation should (a) send only what the user
  clicked to search, (b) never include the share-link state (`sv=1` payload) or anything from the
  request/approval flow, (c) label the link as sponsored, and (d) update `privacy.html`.
- **Disclosure:** the FTC says to "disclose when you have any financial ... relationship with a
  brand" (Source-backed). Other markets have their own rules (Unknown).

---

## 3. What to measure first (gates)

The analytics layer records about 40 event names, with URLs reduced to origin+path. It drops all
query parameters, UTM included, so **acquisition source isn't recorded** (Observed, BASELINE /
`src/ui/analytics.ts`). The gates below use only events that fit that design (Hypothesis: confirm
the exact event names in `analytics.ts`).

| Metric | Why it gates | Threshold before monetizing (Hypothesis) |
| --- | --- | --- |
| Activated planners / month (saw a personal plan) | Base for every revenue line | ≥ 2,000 for 2 consecutive months |
| Export rate (ICS, image, request copy) / activated | Shows the plan is acted on | ≥ 15% |
| Share rate / activated | Organic growth, partner value | ≥ 5% |
| 30-day return rate (ReturningDashboard opens) | The only proxy for repeat need, i.e. premium viability | ≥ 20% |
| Optional sign-in plus reminders on | Willingness to give an email for an ongoing benefit | ≥ 3% of activated |
| Outbound "find stays" click-through (§4, E2) | Travel intent | ≥ 3% of activated |

Precondition: a working, paid or otherwise live analytics sink. If Plausible has lapsed, none of
these can be read.

---

## 4. Recommended experiments (all $0 and Hobby-compliant until E4)

| # | Experiment | Gate to start | Honest? Privacy-safe? | Decision rule |
| --- | --- | --- | --- | --- |
| E1 | **Baseline 8 weeks.** Fix analytics (§6), then read §3 metrics only | Analytics confirmed recording | Yes; no new data | Sets the baseline for all others |
| E2 | **Plain outbound link, no affiliate ID:** "Look for stays on these dates", opening a neutral search page in a new tab after a click. Track the click event only | E1 done; ≥ 1,000 activated / month | Yes. It's a real link, not a fake door. Dates leave only when the user clicks. Non-commercial, so allowed on Hobby (Hypothesis) | CTR ≥ 3% → E4 candidate; < 1% → drop affiliates |
| E3 | **Reminder value test:** compare return rate of signed-in-with-reminders users against others | ≥ 100 reminder users | Yes; uses existing opt-in | No uplift → premium "more reminders" is dead |
| E4 | **Affiliate pilot:** swap E2's link for one programme's tracked link, with a disclosure label and a privacy-page update | E2 passes; Vercel Pro in place; programme accepts the site | Yes, if disclosed | Revenue per 1,000 activated > monthly cost share (§5) for 3 months, or stop |
| E5 | **B2B interest:** a "For teams" link from the consumer site to the `apps/teams` landing page; count clicks | Owner decides the B2B product is ready to be seen | Yes | Clicks feed a B2B decision, not consumer revenue |

**Avoid fake-door tests** for paid features, such as "Premium: $3/month" buttons that lead nowhere.
They mislead users, conflict with the product's trust positioning, and the repo rules forbid submit
or "Generate" style flows (Observed, BASELINE). If a demand test is unavoidable, use a clearly
labelled, optional "Would you pay for X? Yes / No" question with no email capture (Hypothesis).

---

## 5. Lightweight financial model (ALL INPUTS ARE ASSUMPTIONS)

This is a hypothesis to falsify with E1 and E2. None of the rates below has been observed for
Timebower.

### 5.1 Affiliate revenue

Formula: `visitors × activation × affiliate CTR × booking conversion × commission per booking`.

| Assumption | Low | Base | High | Basis |
| --- | --- | --- | --- | --- |
| Activation (sees a personal plan) | 40% | 50% | 60% | Hypothesis |
| Affiliate CTR among activated | 1% | 3% | 6% | Hypothesis |
| Booking within cookie window | 1% | 2% | 4% | Hypothesis (short windows, §2.1) |
| Commission per booking | $8 | $12 | $16 | Hypothesis. About $400 stay: Expedia "up to 4%" = $16; Booking's share of its commission unverified |

| Visitors / month | Low ($/mo) | Base ($/mo) | High ($/mo) |
| --- | --- | --- | --- |
| 1,000 | 0.32 | 3.60 | 23.04 |
| 10,000 | 3.20 | 36.00 | 230.40 |
| 50,000 | 16.00 | 180.00 | 1,152.00 |

### 5.2 Consumer premium (for comparison)

Formula: `visitors × activation (50%) × 30-day return (20%) × paid conversion (1%) × $12/year`.
All inputs are Hypothesis.

| Visitors / month | New payers / month | Added annual revenue per month's cohort |
| --- | --- | --- |
| 1,000 | 1 | $12 |
| 10,000 | 10 | $120 |
| 50,000 | 50 | $600 |

Payment-processor fees, refunds and VAT are not included (Unknown).

### 5.3 Monthly cost once monetized

| Item | $/month | Label |
| --- | --- | --- |
| Vercel Pro, 1 developer seat (required for any commercial use, §6) | 20 | Source-backed |
| Plausible Starter, 10k pageviews/month (yearly billing "2 months free") | 9 | Source-backed (plausible.io pricing section) |
| Plausible at 50k+ pageviews | higher tier, price not captured | Unknown |
| Neon Postgres (Free plan) | 0 | Source-backed limits, §6 |
| Gmail sending (consumer account) | 0 | Observed (repo setup doc) |
| Custom domain | about 1 (≈ $10/yr) | Unknown (repo's own estimate, not verified) |
| **Total, low traffic** | **≈ 30** | |

**Base-case break-even for affiliates alone is ≈ 8,300 visitors/month** ($30 ÷ $0.0036 per visitor).
That assumes the base rates hold and Plausible stays on its lowest tier. At 1,000 visitors a month,
every option loses money once Pro is required (Hypothesis).

---

## 6. Platform limits and the commercial-use issue

### 6.1 Vercel Hobby: commercial use (CONFIRMED in the Terms)

- Vercel Terms of Service, §4 Hobby Plan (last updated 19 Oct 2026): "You shall only use the
  Services under a Hobby plan for your personal or non-commercial use." The Terms don't define
  "commercial" (Source-backed).
- The Fair Use Guidelines page (updated 12 Nov 2026) loaded, but its HTML **did not contain the word
  "commercial"** (Observed). Older versions widely quoted as saying "Hobby teams are restricted to
  non-commercial personal use only" may have been edited. The Terms are the binding text either way.
- **Consequence (Hypothesis, owner to judge):** affiliate links, sponsorships, ads or a paid tier on
  the consumer site would be commercial use. Move to Pro before E4.
- **Separate flag:** `apps/teams` builds as the Vercel project `leave_management` on every push
  (Observed, BASELINE). If that B2B product is offered to companies, or meant to be, the Hobby
  clause applies to it too (Hypothesis).

### 6.2 Vercel Hobby limits that already bite (Source-backed unless marked)

| Limit (Hobby) | Value | Relevance |
| --- | --- | --- |
| Deployments per day | 100 (Pro 6,000) | **Already exceeded**: #158 and #159 failed with "Deployment rate limited" (Observed, BASELINE). Two projects build per push |
| Cron jobs | Once per day minimum interval, ±59 min precision | `api/remind` runs `0 13 * * *` (Observed), which fits. Nothing more frequent is possible |
| Function invocations | First 1,000,000 / month | Fine at current scale |
| Active CPU / provisioned memory | 4 CPU-hrs / 360 GB-hrs per month | Fine for the feed and reminders at small scale (Hypothesis) |
| Fast Data Transfer / Origin Transfer | 100 GB / 10 GB | Fine for a static app (Hypothesis) |
| Web Analytics | 50,000 events/month, **no custom events**, 1-month window. Over the limit, collection stops after a 3-day grace and resumes after 7 days | Can't replace Plausible's funnel events |
| Runtime logs | 1 hour | Debugging the reminder cron is hard |
| Over-limit behaviour | Usually wait 30 days | Risk of the site's functions pausing |

### 6.3 Plausible (Source-backed)

- Plans: Starter, Growth, Business, Enterprise. **Starter is $9/month for 10k monthly pageviews.**
  Yearly billing gives "2 months free".
- **No free plan.** The 30-day trial has Business features. After it ends, stats keep recording "a
  few more days", then the dashboard locks and stats are eventually deleted permanently, with an
  email warning first.
- Free alternative: Plausible **Community Edition**, self-hosted under AGPLv3, without funnels and
  similar premium features. It needs its own server, which isn't $0 in practice (Hypothesis).
- **Unknown:** whether a Plausible account exists for `pto-optimizer-seven.vercel.app`, who owns it,
  and whether it's paid (BASELINE).

### 6.4 Neon Free (Source-backed)

100 projects; 100 CU-hours per project per month; 1 GB storage per project (writes blocked above
it); 5 GB egress; compute scales to zero after 5 minutes. Over-limit compute is suspended until the
next period, with no data loss. No commercial-use restriction is stated on the pricing page. It
describes the plan as "Prototypes, side projects, and small teams". Full ToS not reviewed
(Unknown).

### 6.5 Email

The repo's setup doc says Gmail allows "about 500 recipients a day" and the app caps at 400
(`DAILY_EMAIL_CAP`, Observed). Gmail's own limit and whether a consumer Gmail account may send
transactional mail for a commercial service were **not verified** (Unknown).

---

## 7. Decision checklist for the owner

1. Confirm Plausible status today. If it has lapsed, decide between paying $9/mo, self-hosting, or
   accepting no funnel data. This must happen before any experiment.
2. Stop wasting the deploy quota (one project per push, fewer branch previews). This is a
   reliability issue, not a revenue one.
3. Run E1 for 8 weeks.
4. Run E2 only if the gates are met.
5. Decide on Vercel Pro **before** any affiliate ID, sponsorship or payment reaches production.
6. Decide separately whether `apps/teams` is commercial and therefore needs Pro today.

---

## 8. Sources (all accessed 2026-11-22)

| Topic | URL |
| --- | --- |
| Vercel Terms of Service (§4 Hobby) | https://vercel.com/legal/terms |
| Vercel Fair Use Guidelines | https://vercel.com/docs/limits/fair-use-guidelines |
| Vercel Hobby plan limits and Pro seat price | https://vercel.com/docs/plans/hobby |
| Vercel cron jobs usage and pricing | https://vercel.com/docs/cron-jobs/usage-and-pricing |
| Vercel Web Analytics limits | https://vercel.com/docs/analytics/limits-and-pricing |
| Plausible pricing (homepage pricing section) | https://plausible.io/#pricing |
| Plausible free trial | https://plausible.io/docs/trial |
| Plausible Community Edition | https://plausible.io/self-hosted-web-analytics |
| Neon pricing | https://neon.com/pricing |
| Booking.com Affiliate Partner Programme | https://www.booking.com/affiliate-program/v2/index.html |
| Expedia Group affiliate programme | https://partner.expediagroup.com/en-gb/solutions/explore-our-affiliate-program |
| Expedia Travel Creator help centre (rates, 7-day window) | https://help.creator.expediagroup.com/hc/en-us/articles/15187327581591-What-commission-will-I-earn |
| Skyscanner affiliates | https://www.partners.skyscanner.net/product/affiliates |
| FTC disclosures guidance | https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers |
