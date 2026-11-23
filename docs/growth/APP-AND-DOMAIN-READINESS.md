# Timebower: custom domain and native app readiness

Written 2026-11-22 for the launch-readiness branch. It reads `docs/growth/BASELINE.md` first and
checks the repo as it stands. Nothing here was bought, registered, filed or changed in DNS or at
any service. No product code was edited.

Every claim has a label:

- **Observed**: seen directly in the repo, the live site, or a public lookup run on 2026-11-22.
- **Source-backed**: stated on an official page listed in the source table (accessed 2026-11-22).
- **Hypothesis**: a reasoned expectation that has not been tested.
- **Unknown**: not checked or not checkable without owner access.

This is not legal advice. The trademark section reports search results. It does not give a
clearance opinion.

---

## 1. Summary

| Question | Answer | Label |
| --- | --- | --- |
| Is "TIMEBOWER" filed or registered at the USPTO? | 0 records for `timebower`, `"time bower"` or `time AND bower` | Observed |
| Is there a nearby mark in software classes? | Yes. **BOWER** (SBS Projects LLC), SN 99558974 (class 9) and SN 99558965 (class 42), both for planning, scheduling and event software, status "Notice of allowance - issued" | Observed |
| Are timebower.com / .app / .co / .io / .org / .net free? | No registration record on any of them in registry RDAP/WHOIS | Observed |
| Can the move be "one env var"? | Mostly. Two literals and five operational items also need handling (§4) | Observed |
| Biggest move risk | Saved plans live in **origin-scoped localStorage**. A plain 301 strands every returning user's saved plans on the old host | Observed (code) + Hypothesis (impact) |
| Native app now? | **No-go.** It would cost money ($99/yr Apple, $25 Play), Play needs 12 testers for 14 days, and a web wrapper risks Apple 4.2 | Source-backed |

---

## 2. Trademark diligence

### 2.1 What a knockout search is

A knockout search is a quick screen of the USPTO register (and a general web search) for identical
or obviously similar marks on related goods and services. It can rule a name out cheaply. It
cannot clear a name. A full clearance also covers state registers, common-law use, phonetic and
foreign-equivalent variants, and an attorney's likelihood-of-confusion judgment. **Hypothesis**:
the owner should treat everything below as a knockout result only.

Relevant Nice classes for Timebower:

- **Class 9**: downloadable software and apps (a PWA or native app).
- **Class 42**: SaaS and non-downloadable web software (the planner as a website).
- Optionally **class 35** (HR/workforce services, relevant to `apps/teams`) and **class 41**
  (if the content site is the product).

### 2.2 What was searched (Observed, 2026-11-22)

The searches ran against the USPTO Trademark Search system (tmsearch.uspto.gov). They used its public
JSON search endpoint, the same one the web UI calls, and matched the wordmark and pseudo-text fields.

| Query | Total hits | Live hits worth noting |
| --- | --- | --- |
| `timebower` | 0 | none |
| `"time bower"` / `time AND bower` | 0 | none |
| `timebow*` | 1 | TIMEBOWL, class 21 (housewares), SN 99125528. Unrelated goods |
| `bower` | 89 | See next table |
| `timebank*` | 8 | TIMEBANK class 37; HEXITIME TIMEBANKING class 35. Distant |

Live BOWER-family marks in or near software classes:

| Mark | SN / Reg | Class | Goods/services (abridged) | Status |
| --- | --- | --- | --- | --- |
| BOWER (SBS Projects LLC) | SN 99558974 | 9 | Downloadable software for planning and managing weddings and social events: tasks, schedules, budgets | Notice of allowance issued |
| BOWER (SBS Projects LLC) | SN 99558965 | 42 | SaaS for event planning, generating schedules, and integration with third-party services such as calendars | Notice of allowance issued |
| BOWER (SBS Projects LLC) | SN 99558983 | 35 | Goods/services text not reviewed | Live |
| BOWER (Sugi Group AB) | Reg 7673946 | 9, 35, 36, 40 | Recycling apps and coupons | Registered |
| BOWER (S. Bower, Inc.) | Reg 8485262 | 9, 35 | Cameras and accessories | Registered |
| TIDEBOWER | SN 50091600 | 9 | Hardware (mounts, chargers, alarms) | New application |

**Observation, not a conclusion:** the SBS Projects BOWER filings are the closest. They cover
planning and scheduling software in classes 9 and 42 and mention calendar integration. TIMEBOWER
contains BOWER as its distinctive tail. Whether "TIME" plus "BOWER" for PTO planning would be found
confusingly similar is an attorney question. **Unknown**: state registers, common-law use, and EUIPO
and UKIPO (the site serves several countries).

A general web search for `"Timebower"` returned no product using that exact name. The nearest
results were TimeBrew, Timerow, Timebar and a German children's timer called "Timebow" (Observed).

### 2.3 Recommended next steps (owner, $0 to start)

1. Re-run the searches in the USPTO web UI and save screenshots with dates. Add phonetic variants:
   `tymbower`, `timebauer`, `time bowr`.
2. Search EUIPO eSearch and UKIPO if EU and UK traffic matters.
3. Before spending on a domain or app store listing, decide whether the BOWER (SBS) filings justify
   a paid attorney clearance. Filing fees and attorney costs are outside the $0 budget and were not
   researched.

---

## 3. Domain naming and handles

### 3.1 Registration status (Observed, 2026-11-22; read-only RDAP/WHOIS)

Each lookup went to the registry's own RDAP server, found via the IANA bootstrap file. Each server
was first checked against a known registered domain, which returned HTTP 200.

| Domain | Result | Notes |
| --- | --- | --- |
| timebower.com | 404 at Verisign RDAP: no record | Best default if affordable |
| timebower.app | 404 at Google Registry RDAP | `.app` requires HTTPS (Hypothesis: on the HSTS preload list; Vercel serves HTTPS anyway) |
| timebower.co | WHOIS: "DOMAIN NOT FOUND" | Often mistyped as .com |
| timebower.io | WHOIS: "Domain not found" | |
| timebower.org / timebower.net | 404 | Worth registering only defensively |
| gettimebower.com, trytimebower.com, usetimebower.com, timebowerapp.com | 404 | Fallbacks if .com becomes unavailable |
| pto-optimizer.app | 404 at Google Registry RDAP | The domain the ICS UIDs use is **not registered by anyone**. See §4.3 |

"No record" means unregistered at that moment. It says nothing about price: registries can mark
names as premium. **Unknown**: prices. Nothing was added to a cart.

### 3.2 Naming approach (Hypothesis)

- Prefer **timebower.com** as the canonical host. People type .com by default.
- If budget allows only one, skip defensive TLDs. If two, add `.app` and redirect it to `.com`.
- Use the apex as canonical, or `www` (Vercel recommends `www` as primary with an apex redirect,
  Source-backed). Pick one and never change it again. Every later change is another site move.
- Avoid hyphens and "pto" in the domain. The product name is Timebower, and "pto" ties the brand to
  US vocabulary.

### 3.3 Social handles (Unknown)

Handles were **not** checked. Signing up or probing them counts as creating accounts, which this
brief rules out. The owner should check `timebower` on X, Instagram, TikTok, Threads, Bluesky,
LinkedIn (company page), Reddit (u/ and r/), Product Hunt and GitHub (org). Claim them all on the
same day as the domain, with the same spelling. If `timebower` is taken anywhere, use one fallback
everywhere (for example `timebowerapp`), not a different one per network.

---

## 4. Exact repo and ops changes for a domain move

Checked against the repo on 2026-11-22 (Observed unless marked).

### 4.1 Build-time origin (one env var)

| Item | Where | Change |
| --- | --- | --- |
| Canonical, OG, Twitter, sitemap, robots, JSON-LD `$schema`, legal pages | `scripts/siteUrl.ts` `getSiteUrl()` reads `SITE_URL`; used by `vite.config.ts` (`%SITE_URL%`, `%SITE_HOST%`), `scripts/prerender.ts`, `scripts/build-seo-files.ts`, which also rewrites `https://pto-optimizer.app` inside privacy, terms and docs HTML | Set `SITE_URL=https://timebower.com` in Vercel **Production** env. Optionally change the default literal too |
| Plausible `data-domain` | `index.html:58`, `scripts/generate-glossary-html.ts:64` use `%SITE_HOST%` | Follows `SITE_URL` automatically. See §6 for the dashboard side |
| `og:url`, `og:image`, `twitter:image`, canonical | `index.html:20-41` use `%SITE_URL%` | Follows automatically |

### 4.2 Literals that do not follow the env var

| Item | Where | Change |
| --- | --- | --- |
| Client SSR fallback host | `src/ui/siteUrl.ts` `DEFAULT_SITE_HOST = 'pto-optimizer-seven.vercel.app'` | Edit the literal in the same PR. Client code must not read `process.env` (file comment) |
| Email links and the sign-in origin | `server/account/config.ts` reads `APP_URL`; falls back to the request origin | Set `APP_URL=https://timebower.com` in Vercel env |
| Manifest | `public/manifest.webmanifest` uses relative `start_url`, `scope` and `id: "/"` | No edit needed. A new origin is a **new PWA identity**, so existing installs do not migrate (Hypothesis) |
| Support contact | `public/privacy.html:127-128`, `public/terms.html:115-116`: `gaplessreminders@gmail.com`, subject "Gapless Contact" | See §7 |

### 4.3 Calendar UIDs: keep them

`src/ui/icsExport.ts` (8 UID templates), `src/autopilot/watchFeed.ts:36` (`UID_DOMAIN`) and their
tests all use `@pto-optimizer.app` (Observed). **Do not change them.** Calendar apps match events
by UID. A new UID suffix would make every re-import or feed refresh create duplicates next to the
events people already have (Hypothesis, standard RFC 5545 behaviour). A UID only has to be globally
unique. It does not need a domain the site owns. pto-optimizer.app is unregistered (Observed), so a
third party could register it. That does not make the UIDs collide in practice (Hypothesis).

### 4.4 Things that break if you just add a 301

1. **Saved plans and requests are in `localStorage`** under `gapless.*` keys. localStorage is per
   origin (Observed: the manifest description says plans "stay in this browser on this device").
   After a host-wide 301, a returning visitor lands on the new origin with an empty store. Their
   data is still on the old origin, which they can no longer reach. **Mitigation (Hypothesis):**
   - Phase A: serve both hosts, with the new one canonical. On the old host, show a "We moved"
     banner that runs the existing backup export. Better: offer a one-click "Open on
     timebower.com" link that carries the backup in the URL **fragment** (`#`), so it never reaches
     a server log, and imports it there. Plan state already round-trips through the URL
     (`src/ui/urlState.ts`), so this reuses an existing pattern. This needs a product PR.
   - Phase B: switch on the 301 only after the banner has run for an agreed window (for example
     4 to 8 weeks) and the old host's returning-visitor count has dropped.
2. **Signed-in users are signed out.** Session cookies are host-scoped. They sign in again on the
   new host. Magic links in emails already sent point at the old `APP_URL`. **Unknown**: whether
   Vercel's domain redirect keeps the path and query string. Test one link before cut-over.
3. **Calendar subscriptions (`/api/feed`, `/api/watch`)**. Subscribed calendar clients poll the old
   URL. **Unknown**: whether Google, Apple and Outlook calendar clients follow a 301 on a feed.
   Safer: keep feed paths served on the old host and redirect everything else. A dashboard domain
   redirect covers the whole host, so the selective version needs `vercel.json` `redirects` with a
   `has: [{type: "host"}]` condition instead (Hypothesis; check against Vercel's routing docs).
4. **Installed PWAs** keep `start_url` on the old origin. They follow the redirect into a browser
   tab, not standalone mode (Hypothesis). The owner can't migrate these. The banner text should
   tell users to reinstall.

### 4.5 Vercel steps (owner)

1. Project `pto-optimizer` → Settings → Domains → add `timebower.com` (and `www`). Vercel shows the
   DNS records: an A record for the apex, a CNAME for `www`, or Vercel nameservers. Vercel then issues
   the HTTPS certificate automatically (Hypothesis: standard Vercel behaviour; the add-a-domain doc
   was not fetched this session).
2. Set `SITE_URL` and `APP_URL`, then redeploy. **Blocker (Observed in BASELINE):** the Hobby quota
   of 100 deployments a day is being used up, and two projects build on every push. Pick a quiet
   day or stop branch previews first.
3. Phase B: Domains → edit `pto-optimizer-seven.vercel.app` → "Redirect to" `timebower.com`.
   Vercel's docs show this for project domains whenever more than one exists (Source-backed).
   **Unknown**: whether the `*.vercel.app` production alias can be set to redirect in the UI, and
   which status code it uses (the docs page lists no codes). If it can't, use a `vercel.json`
   host-conditioned `redirects` entry with `permanent: true` (308).
4. **Hobby commercial-use clause**: see MONETIZATION.md §6. A custom domain is allowed on Hobby
   (50 per project, Source-backed). Monetizing is the separate issue.

### 4.6 Google Search Console

- **Domain property** (`timebower.com`, covers all subdomains and protocols) needs a DNS TXT
  record. This is the recommended property for the new domain (Source-backed).
- The old host **cannot** have a Domain property: you can't add DNS records under `vercel.app`. It
  **can** have a URL-prefix property (`https://pto-optimizer-seven.vercel.app/`), verified by HTML
  file or meta tag, since you control what the site serves (Hypothesis, standard verification
  methods).
- **Change of Address tool:** Google says it "can be used only on properties at the domain level"
  and gives `m.example.com` as eligible. Only path-level properties are excluded. You must own
  both properties in the same Google account, 301 the homepage, and keep redirects for at least
  180 days (Source-backed). `vercel.app` is on the Public Suffix List (Observed), so
  `pto-optimizer-seven.vercel.app` behaves like its own registrable site. **So the brief's
  assumption that Change of Address can't be used from the vercel.app host is not supported by
  Google's current text.** It **may** work with a URL-prefix property. That is **Unknown until
  tried**. If the tool refuses it, the move still works through 301s, canonicals and a new sitemap.
  It just loses the explicit signal.
- Submit `https://timebower.com/sitemap.xml` in the new property. Keep the old property to watch
  traffic decay. Google's site-move guide: 301/308 per URL, self-referencing canonicals, "keep the
  redirects for as long as possible, generally at least 1 year" (Source-backed).

### 4.7 Rollback plan

| Step | Rollback |
| --- | --- |
| Domain added, Phase A | Remove `SITE_URL`/`APP_URL` (default falls back to vercel.app) and redeploy. The domain can stay attached |
| 301 enabled, Phase B | Remove the redirect in Domains. Canonicals still point at the new host until a redeploy with the old `SITE_URL`. Do both together |
| Change of Address filed | It can be withdrawn in Search Console (Hypothesis). Avoid filing until Phase B has been stable for 2 weeks |
| Never | Don't let the old host 404, and don't change ICS UIDs |

Keep the old host serving or redirecting for at least 1 year (Google guidance), and indefinitely
for feed paths.

---

## 5. Analytics continuity

- Plausible is keyed by `data-domain`, which follows `SITE_HOST` (Observed). After a move, events go
  to a site named `timebower.com`. In Plausible, **rename** the existing site's domain rather than
  adding a new one, so history stays in one dashboard (Hypothesis: Plausible supports changing a
  site's domain; check its docs at the time).
- **Unknown**: whether a Plausible subscription exists. Plausible has no free plan. After the 30-day
  trial the dashboard locks, collection stops, and stats are eventually deleted (Source-backed). If
  the trial has lapsed, the ~40 custom events in `src/ui/analytics.ts` are recording nothing today.
- Vercel Web Analytics is also on (Observed). On Hobby it has **no custom events**, a 1-month
  window and 50,000 events a month (Source-backed). It can't replace Plausible for funnel events.
- Run both hosts' numbers side by side for the Phase A window. Record the cut-over date in the
  dashboard notes.

## 6. Email and support migration

- Current contact: `gaplessreminders@gmail.com`, with "Gapless" mailto subjects, in privacy and
  terms (Observed). Sending uses `GMAIL_USER` with `MAIL_FROM_NAME` defaulting to "Timebower"
  (Observed, `server/account/config.ts`).
- The **owner must create a Timebower-named address.** No address is proposed here. Options: a new
  free Gmail named for Timebower ($0), or domain mail once the domain exists (cost not researched).
  `docs/setup/FREE-EMAIL-AND-SIGNIN.md` says domain email needs a domain, "about $10 a year"
  (Observed, the repo's own claim).
- When it exists: update both legal pages and their mailto subjects. Point `GMAIL_USER` at it, or
  keep the old sender and change only the reply-to (Hypothesis). Forward the old inbox for 12
  months. Update `docs/personal/DATA.md`, which still says "Gapless" throughout (Observed).

---

## 7. Native app assessment

### 7.1 What the PWA covers today (Observed unless marked)

| Need | PWA today |
| --- | --- |
| Install to home screen | Yes: `manifest.webmanifest` (standalone, maskable icons), `src/pwa/installOffer.ts` |
| Offline | Service worker `src/pwa/sw.ts` with routing tests |
| Local, private storage | Yes, localStorage. No account required |
| Calendar | ICS export and a subscribable feed (`api/feed.ts`, `api/watch.ts`). One-way |
| Reminders | Optional email reminders via a daily cron (`api/remind.ts`, `0 13 * * *`) |
| Cross-device | Only via share links, backup/restore, or optional sign-in (stores plan and policy links) |
| Push notifications | **Not implemented** (no `PushManager` use in `src/`) |

### 7.2 What native would add, and whether the web already covers it

| Native benefit | Web alternative | Label |
| --- | --- | --- |
| Push notifications | Web Push works in Safari for **Home Screen web apps** from iOS/iPadOS 16.4, with permission asked on a user gesture, plus the Badging API | Source-backed |
| Two-way calendar writes (EventKit / CalendarContract) | ICS feed (one-way, works today) | Hypothesis: a nice-to-have, not a reason to build |
| Home-screen widgets ("23 days to your next break") | None on iOS web | Hypothesis: the strongest real native-only feature |
| Cross-device sync | Optional sign-in exists. Full sync is a backend feature, not a native one | Observed / Hypothesis |
| App Store discovery | SEO and sharing | Hypothesis: store search for "PTO planner" is unmeasured |

### 7.3 Store requirements and costs (Source-backed, 2026-11-22)

**Apple**

- Apple Developer Program: **99 USD per membership year**. Fee waivers only for nonprofits,
  accredited education and government.
- **4.2 Minimum Functionality:** the app "should include features, content, and UI that elevate it
  beyond a repackaged website". 4.2.2 adds that apps shouldn't be primarily "web clippings, content
  aggregators, or a collection of links". A WKWebView wrapper of this site is exactly the case
  4.2 targets.
- **5.1.1(v):** if the app supports account creation, it "must also offer account deletion within
  the app". Timebower already has "Delete my account" (Observed, privacy page and DATA.md), so a
  native version would carry it over.
- **Privacy nutrition labels:** declare all data collected by you **and third-party SDKs**
  (analytics included), its purposes, and whether it's linked to identity or used for tracking.
  Answers must be kept accurate. A native build that kept Plausible would have to declare usage
  data.
- **Screenshots:** at least one; up to 10 per size; .png/.jpg without alpha. iPhone: at least one
  for the Dynamic Island (medium display) class; 6.5" (1284×2778 or 1242×2688) required if no
  large Dynamic Island set; iPad 13" (2064×2752 or 2048×2732) required if the app runs on iPad.
- **Icon:** 1024×1024 App Store icon, no transparency. **Unknown**: the HIG page didn't render, so
  this is unverified this session. Check Icon Composer and layered-icon guidance on the day.

**Google Play**

- Registration: **US$25 one-time**. Identity verification, possibly a government ID and a credit
  card in your legal name. Personal accounts must verify an Android device.
- **Personal accounts created after 13 Nov 2023**: before production access, run a closed test
  with "a minimum of 12 testers who have been opted in continuously for at least 14 days". A tester
  who opts out and rejoins restarts their days.
- **Data safety form:** required for every app on closed, open or production tracks, even one that
  collects nothing, with a privacy-policy link. It covers collection, sharing, encryption in
  transit and deletion requests.
- **Target API:** from 31 Aug 2026, new apps and updates must target **Android 16 (API 36)**.
  Existing apps must target API 35 to stay visible to new users on newer devices.

### 7.4 Recommendation: **NO-GO now**

Reasons:

1. **Budget:** $99/yr plus $25 breaks the $0 constraint (Source-backed fees).
2. **Policy risk:** a wrapper adds no native-only feature, so Apple 4.2 rejection is a real risk
   (Hypothesis based on the quoted guideline text).
3. **No evidence:** BASELINE records no users, ratings or testimonials (Observed). Play's
   12-tester, 14-day closed test is itself hard without a user base.
4. **Ops load:** two more release pipelines, store privacy declarations, the Android API-level
   treadmill, and a third deploy target, on top of a Hobby quota that is already exhausted
   (Observed).
5. **The web already covers it:** install, offline and local storage exist. Web Push is
   available on iOS 16.4+ Home Screen apps if reminders need to move off email.

**Evidence that would justify revisiting (Hypothesis thresholds; set them before looking):**

- At least **500 weekly returning planners** (ReturningDashboard opens) for 8 consecutive weeks.
- At least **15% of returning users installed the PWA** (`?source=pwa` start_url), which shows they
  want an app.
- An unprompted, repeated request for **widgets or calendar write-back**: at least 20 distinct
  support emails or feedback items.
- Web Push shipped first and measured. If opt-in is under 5% among installed users, a native app
  won't fix that.
- A budget line exists, and the trademark question in §2 is resolved. Store listings make the
  name public and harder to change.

If all of these are met, build a **thin native shell with a real native feature** (widget plus
local notifications) reusing `packages/engine`, not a bare WebView.

---

## 8. Sources (all accessed 2026-11-22)

| Topic | URL |
| --- | --- |
| USPTO Trademark Search (UI and the JSON endpoint it calls) | https://tmsearch.uspto.gov/ |
| Verisign RDAP (.com/.net) | https://rdap.verisign.com/com/v1/domain/timebower.com |
| Google Registry RDAP (.app) | https://pubapi.registry.google/rdap/domain/timebower.app |
| PIR RDAP (.org) | https://rdap.publicinterestregistry.org/rdap/domain/timebower.org |
| IANA RDAP bootstrap | https://data.iana.org/rdap/dns.json |
| Public Suffix List (vercel.app entry) | https://publicsuffix.org/list/public_suffix_list.dat |
| Vercel: deploying and redirecting domains | https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting |
| Vercel: Hobby plan (domains per project, deployments per day) | https://vercel.com/docs/plans/hobby |
| Vercel: Web Analytics limits | https://vercel.com/docs/analytics/limits-and-pricing |
| Google: Change of Address tool | https://support.google.com/webmasters/answer/9370220?hl=en |
| Google: site moves with URL changes | https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes |
| Plausible: free trial | https://plausible.io/docs/trial |
| WebKit: Web Push for web apps on iOS/iPadOS | https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/ |
| Apple Developer Program fees | https://developer.apple.com/programs/whats-included/ |
| App Store Review Guidelines (4.2, 5.1.1(v)) | https://developer.apple.com/app-store/review/guidelines/ |
| App privacy details | https://developer.apple.com/app-store/app-privacy-details/ |
| Screenshot specifications | https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications |
| App icons HIG (did not render; unverified) | https://developer.apple.com/design/human-interface-guidelines/app-icons |
| Play Console registration fee | https://support.google.com/googleplay/android-developer/answer/6112435 |
| Play testing requirement for new personal accounts | https://support.google.com/googleplay/android-developer/answer/14151465 |
| Play Data safety section | https://support.google.com/googleplay/android-developer/answer/10787469 |
| Android target SDK requirement | https://developer.android.com/google/play/requirements/target-sdk |
