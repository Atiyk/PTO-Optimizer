# Timebower competitive and demand research, 2026-11-22

Scope: consumer PTO planning for salaried US employees with 10–20 PTO days, for the 2027 planning window.
Method: live pages read on 2026-11-22 with WebFetch, WebSearch and a read-only browser pane. I created no accounts and submitted no forms, and I declined cookie prompts.
Product facts about Timebower come from `docs/growth/BASELINE.md`.

Evidence labels:
- **Observed**: I saw it on a live page today.
- **Source-backed**: a primary source (paper, survey page or PDF) says it.
- **Hypothesis**: my inference. It needs a test.
- **Unknown**: I could not measure or verify it.

Access limits (**Observed**):
- Reddit is blocked for both search and the browser here.
- apps.apple.com, pewresearch.org and stretchmytimeoff.com are blocked for WebFetch. Apple and Pew loaded in the browser pane; Stretch My Time Off was not read at all.
- Forbes returns 403 to WebFetch, but the article text rendered in the browser.
- ustravel.org HTML pages return 403 ("Access Denied"). I extracted the text of its 2018 PDF from the raw file.
- Axios returns 403.

I found no search-volume numbers. Every volume below is **Unknown**.

---

## 1. The market in one paragraph

Free web tools for "where to put my PTO" are now commodity. At least six free planners exist, and two of them are strong on SEO: Holiday Optimizer and the PTO Planner from Vacation Tracker (**Observed**). Large publishers rerun the same article every year: "turn N PTO days into M days off in YEAR" (**Observed**: Forbes for 2025, 2026 and 2027, plus CNBC and Fortune in 2026). The core math is now table stakes. What no competitor does well is everything after the plan:
- employer-specific holidays as a first-class input
- the request itself (request text and an ask-by date)
- partner and school coordination
- making sure PTO does not expire

Those are exactly Timebower's differentiators (**Observed** on competitor pages and in BASELINE.md). Distribution, not features, is Timebower's gap. It has no 2027 landing pages, no attributable acquisition and no third-party mentions (BASELINE.md).

---

## 2. Direct competitors

### 2.1 Holiday Optimizer (holiday-optimizer.com)

The strongest SEO competitor. Built by Waqar Bin Kalim.

- **What it is (Observed):**
  - Page title: "Maximize PTO 2027: Free Vacation Day Planner".
  - Inputs: PTO days; timeframe (2027 default, 2028, rest of 2026, or a custom 12 months); five strategies (Balanced, Long Weekends, Mini Breaks, Week-long, Extended); country, state and region (FAQ claims 100+ countries); weekend days; pre-booked days; "Company Days Off".
  - The site says custom public holidays are not supported yet. Company days off stand in for them.
- **1 Discovery (Observed):**
  - A deep SEO hub, linked from the homepage:
    - `/blog/guides/maximize-pto-2027-us/`, `-2026-us`, Canada, UK, Ireland and Australia
    - PTO maxxing, PTO expiring at year end, 9/80 schedules, four-day weeks, fiscal-year resets, company shutdowns
    - eight city "long weekend" destination guides
    - `/holidays/`, `/pto-calendar/` and `/methodology/`
  - The 2027 US guide was published 2026-06-28 and updated 2026-08-25, five or more months before the season. Its headline is "Turn 15 PTO Days Into 48 Days Off". It has 10-, 15- and 20-day plans, a CSV download and a PDF calendar, and deep links into the planner with prefilled query parameters (`country=US&year=2027&days=15&strategy=balanced`) (**Observed**).
  - The homepage shows Travel + Leisure, Washington Post and Forbes logos. I could not find the underlying articles in search (**Unknown**).
  - FareCompare attributes a "11 days → 41 days off in 2026" claim to Holiday Optimizer (**Observed** in a search snippet).
  - Google autocomplete for "holiday optimizer" suggests 2026, 2027, 2025, canada, github, free, uk, website and reddit (**Observed**). This points to brand-name search and Reddit discussion of the tool. The volume is **Unknown**.
  - A third-party aggregator shows the repo `waqarkalim/holiday-optimizer` with about 508 stars (**Observed** on relatedrepos.com; I did not see GitHub itself).
- **2 First use (Observed):** free, and "no account or login required". You enter a number and get a plan immediately.
- **3 Return (Hypothesis):** the yearly rollover, driven by the year-stamped guides (2025 → 2026 → 2027 → 2028). I saw no email capture, account or reminders.
- **4 Sharing (Observed):** the homepage describes no sharing feature. The deep-link parameters mean plans are URL-addressable in principle.
- **5 Money (Observed):**
  - "An optional paid calendar export is available". The price was not visible without starting a purchase, so it is **Unknown**.
  - A cross-promotion for the maker's other project (BeaconChess) with UTM tags.
  - Cookie-free analytics by default.
- **6 Where Timebower is better (Observed on both sides):**
  - Timebower's ICS export is free; Holiday Optimizer's is paid.
  - Timebower accepts true custom employer holidays.
  - Timebower writes the request text and gives an ask-by date per break. It also has partner overlap, school-break family planning, a policy and expiry forecast, and a PWA.
- **7 Adopt / avoid:**
  - Adopt: year-stamped guides published early, a CSV or PDF of the plan, deep links with prefilled inputs from every guide, and "PTO maxxing" vocabulary.
  - Avoid: paywalling export (an obvious complaint vector), and press logos you cannot link to.
- **Copycat confusion (Observed):** a different "Holiday Optimizer" lives at `holiday-optimizer-eight.vercel.app`. A dev.to author ("eastkap", Paris) promotes it in at least ten year- and holiday-specific posts, such as "Easter 2026 is 18 days away", "2026 PTO cheat sheet" and "every year through 2030". Those posts are cheap to make and they rank in general web search. This is evidence that **dev.to-style posts timed to each holiday** are a working low-cost channel. Whether they get clicks is **Unknown**.

### 2.2 Vacation Tracker: free PTO Planner 2027 (vacationtracker.io/tools/pto-planner/)

A B2B leave-tracking company running a free consumer tool as a lead magnet. Of everything I found, this is the closest feature match to Timebower.

- **What it is (Observed):**
  - Inputs: country and state (107 countries); PTO days; break style (Long weekends, Balanced, or Longer breaks of 7–16 days); untick public holidays; add company days off; days already booked.
  - Outputs: a headline ("Turn 13 PTO days into 55 days off in 2027"), a numbered list of breaks, a year calendar, and a **busy-week rating per week**. The rating comes from "Vacation Tracker bookings from November 2024 to September 2026" for 35 countries. This is a proprietary data moat Timebower cannot copy.
  - "Free. No email, no account."
- **1 Discovery (Observed):**
  - A companion blog post, "How to Maximize PTO in 2027: Best Days to Take Off", by the co-founder and COO, published 2026-10-23.
  - The post has a quick-answer box, per-country break tables, a "why PTO goes unused" section, a section on getting requests approved, a FAQ, and charts of booking activity.
  - It includes honest caveats: "Check your company calendar before copying it", and totals "include weekends already off". It cross-links to an accrual calculator, a holiday calendar and a "Leave Trends" report.
  - Its index.txt variants appear in search, which suggests it is built for LLMs and AI answers (**Observed** that the URLs exist).
- **2 First use (Observed):** no signup, instant plan.
- **3 Return (Unknown):** I saw no consumer reminder or account. The tool is 2027-only.
- **4 Sharing (Observed):** "copy a share link", where the link "holds your whole plan". Also share as an image, print or PDF, and an .ics file of all breaks or of each break.
- **5 Money (Observed):**
  - Consumers pay nothing. The tool feeds "Start free trial" and "Book a demo" CTAs with tracking parameters.
  - B2B pricing: Core $1.83 and Complete $3.67 per user per month billed yearly, with $550 and $1,100 yearly minimums, a 14-day trial and no free plan.
- **6 Where Timebower is better:**
  - Timebower writes the request text and gives an ask-by date. It has partner overlap, school breaks, an expiry and policy forecast, and multi-year planning (Vacation Tracker is 2027 only). Timebower is also a neutral, employee-side product with no employer vendor behind it (**Observed** on both sides).
  - Feature parity on share link, image share and ICS (**Observed**).
- **7 Adopt / avoid:**
  - Adopt: the honesty caveats (they build trust and match Timebower's "same inputs, same plan" voice), and an approval-advice section on the 2027 page.
  - Avoid: competing on busy-week data. Timebower has none, so do not imply it.
  - **Threat (Hypothesis):** this company has real content resources and a domain with B2B authority, so it will likely outrank a new vercel.app subdomain on "pto planner 2027".

### 2.3 Stretch My Time Off (stretchmytimeoff.com)

- **Discovery (Observed):** a Show HN post on 2024-11-12 got 358 points and 174 comments. The live site is blocked for fetch here, so its current features are **Unknown**.
- **What the HN comments asked for (Observed):**
  - Holidays are wrong for my country, employer or shutdown, so let me edit them.
  - Custom work weeks, fiscal years and date ranges.
  - School breaks.
  - Skepticism that "days off" totals count weekends.
  - People who prefer one long trip, and people who avoid peak travel.
  - Several of those requests are things Timebower already ships: employer holidays, the family and school planner, and an honest calendar-days explainer.
- **Lesson (Hypothesis):** a Show HN or similar launch can produce one large burst of attention. Its comments double as a free user-research list, and Timebower's feature set answers most of it. Lead with the answer to the top HN objection: "your employer's holidays, not the federal list".

### 2.4 App Store planners

**Observed** on apps.apple.com (US):

| App | Price model | Ratings shown |
| --- | --- | --- |
| Long Weekends (Florian Ernst) | Free, "No In-App purchases"; years 2020–2030; 100+ countries; offline | "Not enough ratings" |
| Get Gone! (David Yutzy) | $2.99 plus Pro at $2.99 one-time. Free users see only the **total**; the full plan, Apple Calendar export and **sharing** are Pro. Supports 9/80 and 4/10 schedules, shutdowns, school breaks. "Multiplier" framing (3.0x) | "Not enough ratings" |
| Vacation Maximizer (Juliet du Preez) | Free; 16 languages; lists "Data Used to Track You" (location, identifiers) | "Not enough ratings" |

- **Lesson (Observed plus Hypothesis):** no planner app has enough ratings for an overview, so the App Store is not a proven demand channel for this job. Do not build a native app for 2027.
- Get Gone's "multiplier" (days off per PTO day) is a compact, shareable number, worth testing as share-card copy.
- Get Gone paywalls the plan and the share, and Vacation Maximizer tracks location. Both give Timebower a contrast point: free, no account, nothing tracked beyond event names.

### 2.5 Leavewise and other B2B leave trackers

- **Observed:** LeaveWise (G2 listing) is SMB leave-management software (requests, approvals, balances). G2 says there are "not enough reviews". It is not a consumer competitor.
- Vacation Tracker, Calamari, Connecteam, Paycor, Rize and TimeChamp also publish free "PTO calculators" that compute **accrual or balance**, not placement (**Observed** in search results).
- **Lesson:** "pto calculator" queries are mixed intent (accrual versus planning). Timebower's policy and expiry forecast can target the accrual side ("how many PTO days will I have by December"). This is a **Hypothesis**.

### 2.6 Publisher articles: who ranks and in what format

**Observed** (live or in search snippets, with dates):

| Publisher | Title or claim | Date | Tool cited? |
| --- | --- | --- | --- |
| Forbes (Bailey Berg) | "Want More Vacation Time In 2027? Take These Days Off". Says all 11 federal holidays fall on, or are observed on, a Mon, Thu or Fri; 11 PTO → 44 days; a 10-day year-end break for 4 PTO days | 2026-11-19 | No. Links OPM, AAA and Google travel trends |
| Forbes (Brittany Anas) | "Maximize PTO In 2026: …14 PTO Days Into 46" | 2026-01-05 | Not read |
| Forbes (Brittany Anas) | "How To Turn 15 PTO Days Into 51 Vacation Days In 2025" | 2024-12-18 | Not read |
| CNBC | "'PTO-maxxing' is the key to making the most of your time off in 2026" | 2026-01-19 | None; vague "some estimates" |
| Fortune | "'PTO-maxxing' is the summer hack turning 15 vacation days into 49 days off" | 2026-05-27 | Blink (HR platform) data; cites Pew, Expedia and SHRM/Harris |
| Upgraded Points | "How 11 Days of PTO Can Deliver 44 Days … in 2027" | updated 2026-11-18 | None; credit-card affiliate monetization |
| Secret NYC | "44 days of vacation in 2027 with just 11 days of PTO" | 2026-11-19 | None |
| Travel Pirates | 11 PTO → 43 days in 2027; month by month; "March, April, and August" have no federal holidays | 2026-08-27 | None; flight-deal links |
| Axios | 2026 vacation and holidays PTO piece | 2025-12-23 | 403; not read |
| AOL syndication | "Stretch 11 PTO Days Into 41 Days Off in 2026", "18 PTO days into 55" | 2026 | Not read |

**Pattern (Observed):**
- The stories cluster from mid-November to mid-January, with a second wave before summer (Fortune in May).
- The format is a federal holiday list, then a table of "dates to request", then a totals claim, then the caveat "check your employer's calendar".
- Most publishers **name no tool**. That is an open slot: journalists need a citable, reproducible source.

**Hypothesis:** Timebower's deterministic, URL-reproducible plans ("same inputs, same plan") suit a journalist who wants to link "the exact plan" for 10, 15 and 20 days. Holiday Optimizer appears to have earned FareCompare and AOL-style citations this way.

---

## 3. Adjacent products: only the lessons that transfer

| Product | Observed model | Transferable lesson | Does not transfer |
| --- | --- | --- | --- |
| Going (formerly Scott's Cheap Flights) | Pick home airports, then get deal alerts by email and app. Limited is free; Premium $49/yr; Elite $199/yr; 14-day trial; a referral program is listed (going.com/how-it-works) | The product is the **alert**: value arrives when you are not thinking about it. Timebower's equivalent is the ask-by date and expiry warnings delivered into the user's own calendar (ICS alarms), which needs no account or email | Paid tiers; Timebower's job happens once or twice a year |
| TripIt | Pro is $49/yr; Inner Circle "automatically shares your travel plans" with chosen people (tripit.com/web/pro) | Sharing with a **specific person** (partner or family) creates repeat use. That maps to Timebower's partner overlap | Email-forward parsing; nothing to parse here |
| Flighty | Pro is $4.99/mo or $59.99/yr; free tier includes "Flighty Passport" and "Flighty Friends"; calendar sync is Pro (flighty.com/pricing) | A personal history artifact and a friend layer drive identity sharing (**Hypothesis**: a "my 2027 in days off" year card) | Real-time data costs |
| Wanderlog | Pro about $39.99/yr; collaboration is free, offline and export are Pro (third-party and App Store snippets) | Keep **collaboration free**. Shared planning is the growth loop and should not sit behind a paywall | — |
| Notion templates | Gallery with thousands of creator templates; Notion's own creator guide says success depends on creators' personal brands and off-platform promotion | Google autocomplete for "pto planner" suggests "excel", "template", "google sheets", "excel template" and "calendar" (**Observed**). People search for a **template**. A free "2027 PTO planner Google Sheet / Excel" export, backed by a live link, is a findable asset (**Hypothesis**) | Marketplace selling |

---

## 4. Search-demand evidence for 2027 (no volumes)

Google autocomplete, read on 2026-11-22 via `suggestqueries.google.com` (client=firefox, hl=en, gl=us). **Observed**; relative volume **Unknown**.

| Seed | Suggestions returned (in order) |
| --- | --- |
| maximize pto 2027 | maximize pto 2027 calculator · canada · maximize time off 2027 · optimize pto 2027 · maximize pto days 2027 · best days to maximize pto 2027 · 2027 maximize pto calendar · how to maximize your pto |
| pto 2027 | pto 2027 schedule · 2027 pto calendar · 2027 pto hack · 2027 pto maximize |
| best days to take off 2027 | best days to take off work 2027 · best pto days to take off 2027 · …canada · best time to take off in 2027 · best days to take off in 2027 to maximize pto · best days to book off 2027 |
| long weekends 2027 | long weekends 2027 usa · canada · ontario · (plus non-US markets) |
| pto planner | pto planner 2026 · excel · 2027 · template · calendar · excel template · app · google sheets · calculator |
| holiday optimizer | 2026 · 2027 · canada · 2025 · github · free · uk · website · reddit |
| how to ask for pto | email · approval · payout · days · reddit · professionally · at work · via email · to use pto |
| pto request email | example · template · to manager · sample · reddit · format · personal reasons · simple |
| use it or lose it pto | policy · california · states · colorado · massachusetts · nebraska · reddit · illinois · ohio |
| 2027 holidays | calendar · federal · and observances · usa · list · us · easter · nyse |
| thanksgiving 2027 | date · calendar · day · observed · … |
| 2027 school calendar | nyc · with holidays · nyc with holidays · pdf · printable · (non-US) |
| bridge days 2027 | only WV "Bridge Day" and other unrelated results. "Bridge day" is **not** a US consumer term |
| how to turn 10 pto days | no suggestions |

**What this suggests:**
- These topics are real 2027 topics, each with at least one live suggestion. Volumes are Unknown.
  1. "maximize pto 2027" and "best days to take off 2027", including "calculator" and "calendar" modifiers.
  2. "2027 pto calendar / hack / schedule".
  3. "pto planner 2027 / template / excel / google sheets".
  4. **"how to ask for pto" and "pto request email" (template, example, to manager)**. This is year-independent, evergreen intent, and it maps exactly to Timebower's request text.
  5. "use it or lose it pto [state]". Expiry intent split by state, which fits the expiry guard. It needs care: state law content is YMYL, so cite primary statutes.
  6. "2027 school calendar [city]", which fits the family planner. Most of the intent is district-specific PDFs (**Hypothesis**: hard to win).
- "Bridge days" is a European term. US pages should say "best days to take off", "PTO hack" or "PTO maxxing", not "bridge days" (**Observed** from autocomplete).
- "Turn N PTO days into M days off" is the publisher headline formula, but autocomplete does not complete it. The headline format is not a query; people search "maximize pto 2027" (**Observed**).
- **Reddit:** blocked here. Autocomplete shows "holiday optimizer reddit", "how to ask for pto reddit", "pto request email reddit" and "use it or lose it pto reddit" (**Observed**), so Reddit threads exist for these intents. Their content and size are **Unknown**.
- **TikTok:** Fortune cites a November 2025 TikTok by creator Paige Connell about parents lacking PTO for school breaks (**Observed** in Fortune). CNBC says "PTO-maxxing" is popular on "social media". Volume is **Unknown**.

**2027 calendar facts that drive content (Observed in Forbes 2026-11-19, Upgraded Points, Travel Pirates and Vacation Tracker):**
- All 11 federal holidays land on, or are observed on, a Mon, Thu or Fri.
- Christmas is observed Fri Dec 24 and New Year's 2028 is observed Fri Dec 31, so the year end gives a 9–10-day break for 4 PTO days. Holiday Optimizer frames it as a 16-day window for 8 PTO days.
- Juneteenth is observed Fri Jun 18 and July 4th is observed Mon Jul 5.
- March, April and August have no federal holiday.
- The Veterans Day and Thanksgiving weeks are the 4-PTO → 9-day picks.
- **Caveat everyone repeats:** private employers often observe only about 6 holidays. Vacation Tracker's "six-holiday plan" shows 10 PTO → 35 days, versus 50 on the federal list. That gap is Timebower's employer-holiday message in one sentence.

---

## 5. Primary literature and survey data

| Finding | Label | Applied implication for Timebower |
| --- | --- | --- |
| **Pew Research Center (2023)**, survey of 5,902 US workers, Feb 6–12, 2023. Of workers with PTO, 46% take less than offered (48% take all). Reasons: don't feel they need more (52%), **worry about falling behind (49%)**, feel bad about coworkers taking on work (43%), advancement (19%), job loss (16%), manager discourages (12%). College graduates: 51% take less than offered. 82% of non-self-employed workers say their employer offers PTO | Source-backed (read live) | The barrier is social and work-coverage friction, not math. Lead with request text, ask-by date and coverage-friendly timing, not only "maximize". Target college-educated salaried workers |
| **U.S. Travel Association, State of American Vacation 2018** (2017 data, from the PDF): 52% left vacation unused; 705M unused days (662M the year before); 212M forfeited, worth $62.2B. Workers who **plan their time in advance** are more likely to use all of it (**53% vs 43%**) and are happier, for example with relationships (81% vs 68%). 52% say they plan | Source-backed (PDF text extracted). The 2018-data figure of 768M unused days, 55% with unused days and 236M forfeited comes only from fact-sheet search snippets, so it is **Unknown** as primary. Newer editions: none found | Planning is associated with taking PTO. This is correlational, but it is the best "why plan" stat for copy. The data is old (2017–2018); say so |
| **Gollwitzer 1999**, Am. Psychol. 54:493–503, doi:10.1037/0003-066X.54.7.493. "If-then" plans (when, where, how) increase goal attainment | Source-backed | Each break should end in a concrete when-and-how: "Ask your manager by Fri Jan 15 for Nov 22–26". That is the ask-by date. Make it the hero line, not a detail |
| **Gollwitzer & Sheeran 2006**, Adv. Exp. Soc. Psych. 38:69–119, doi:10.1016/S0065-2601(06)38002-1. Meta-analysis of 94 studies, more than 8,000 participants, d = 0.65 | Source-backed (figures via secondary summaries; DOI verified on Crossref) | The effect is medium-to-large even against people who already intend to act. Supports "mark requested" and the ask-by calendar event |
| **Milkman et al. 2011**, PNAS 108:10415–10420, doi:10.1073/pnas.1103170108. Workplace flu-shot field experiment. A prompt to write the **date and time** raised vaccination by 4.2 points (control 33.1%). A date alone gave +1.5, not significant | Source-backed (abstract via Crossref) | Specificity matters. The ICS should put a **timed** "send PTO request" event (date and time) on the ask-by day, not just all-day break blocks |
| **Iyengar & Lepper 2000**, JPSP 79:995–1006, doi:10.1037/0022-3514.79.6.995. 24 versus 6 options reduced purchasing in the jam study | Source-backed | Show one recommended plan first, with alternatives behind a control |
| **Scheibehenne, Greifeneder & Todd 2010**, J. Consumer Research 37:409–425, doi:10.1086/651235. 63 conditions from 50 experiments (N = 5,036); the mean choice-overload effect is "virtually zero", with high variance | Source-backed | Do not overclaim choice overload. A single default plan is still sensible, but test it rather than assume it |
| **Johnson & Goldstein 2003**, Science 302:1338–1339, doi:10.1126/science.1091721. Opt-out defaults raised organ-donor consent sharply | Source-backed | Defaults carry outcomes. Prefill 2027, the US, a sensible PTO count, and **employer holidays = common private-employer set, not all 11 federal**, so the first plan is realistic |
| **Lally et al. 2010**, Eur. J. Soc. Psych. 40:998–1009, doi:10.1002/ejsp.674. Time to 95% automaticity ranged 18–254 days for daily behaviours | Source-backed | PTO planning is a once-or-twice-a-year task and will not become a habit. Return visits must be **triggered** (ICS alarms, expiry warnings, year rollover), not habit-based |
| **Berger & Schwartz 2011**, J. Marketing Research 48:869–880, doi:10.1509/jmkr.48.5.869. "Interesting" products get immediate word of mouth but not ongoing; products **cued by the environment** or publicly visible get word of mouth both immediately and over time | Source-backed | Calendar dates are natural cues: every holiday, the out-of-office message, the team calendar. Shareable "I'm off Nov 20–28" artifacts and seasonal hooks beat novelty |
| **Schmitt, Skiera & Van den Bulte 2011**, J. Marketing 75:46–59, doi:10.1509/jm.75.1.46. About 10,000 bank customers; referred customers are at least 16% more valuable, with higher retention | Source-backed (bank context) | Referrals from a partner or coworker are likely to be higher-quality users. Measure them separately once attribution exists (BASELINE: none today) |

---

## 6. Synthesis: where Timebower stands

**Timebower already wins on (Observed, comparing BASELINE.md with competitor pages):**
1. **Employer-holiday customization.** Holiday Optimizer says custom public holidays are "not supported yet". It is the top HN complaint and every publisher's caveat.
2. **Getting the request done.** Timebower writes the request text, sets an ask-by date and tracks requested and approved status. No competitor seen does this. It also addresses Pew's top barriers (falling behind, coworkers) and matches the evergreen "pto request email" intent.
3. **Free ICS export**, where Holiday Optimizer charges and Get Gone puts it behind Pro.
4. **Partner overlap and the school-break family planner.** Get Gone lists school breaks as constraints, but none of the planners seen plans for two people.
5. **Policy and expiry forecast.** This matches "use it or lose it pto" intent. Competitors treat expiry only as a blog topic.
6. **Determinism and URL state.** Shared plans and journalist citations are reproducible.
7. **Privacy posture:** no account, event-name analytics only. Contrast with Vacation Maximizer's "Data Used to Track You".

**Timebower is behind on (Observed):**
1. No 2027 landing pages. Holiday Optimizer published its 2027 guide in June and Vacation Tracker published in October.
2. A `vercel.app` subdomain against established domains (**Hypothesis**: weaker ranking and weaker press credibility).
3. Production is behind `main` and prerendered countdowns are frozen (BASELINE). That risks stale or wrong dates during the exact window when journalists look.
4. No acquisition attribution (UTMs are stripped), so channel tests cannot be read.
5. Zero third-party mentions, ratings or testimonials. Do not invent any.

---

## 7. Source register (all accessed 2026-11-22)

| # | URL | Supports | Access |
| --- | --- | --- | --- |
| 1 | https://holiday-optimizer.com/ | Features, free plus paid export, SEO hub links, press logos, BeaconChess cross-promo | Live (WebFetch + browser) |
| 2 | https://holiday-optimizer.com/blog/guides/maximize-pto-2027-us/ | 2027 guide dates (Jun 28 / Aug 25 2026), 15→48 claim, prefilled deep links, CSV/PDF | Live |
| 3 | https://holiday-optimizer.com/pto-calendar/ | 2027 calendar landing page | Live (browser) |
| 4 | https://relatedrepos.com/gh/waqarkalim/holiday-optimizer | about 508 GitHub stars (third-party) | Search result only |
| 5 | https://dev.to/eastkap/the-ultimate-2026-vacation-calendar-hack-how-to-turn-10-pto-days-into-55-days-off-5e4l | Copycat "Holiday Optimizer" at holiday-optimizer-eight.vercel.app; dev.to content cadence | Live |
| 6 | https://vacationtracker.io/tools/pto-planner/ | Free 2027 planner, share link "holds your whole plan", ICS, busy-week data, trial CTAs | Live |
| 7 | https://vacationtracker.io/blog/maximize-pto-2027/ | 2027 guide (Oct 23 2026), six-holiday versus federal totals, caveats | Live |
| 8 | https://vacationtracker.io/pricing/ | B2B pricing $1.83/$3.67 per user per month, minimums | Live |
| 9 | https://news.ycombinator.com/item?id=42118039 | Stretch My Time Off Show HN: 358 points, 174 comments, request themes | Live |
| 10 | https://apps.apple.com/us/app/id1639946640 | Long Weekends app: free, offline, too few ratings | Live (browser) |
| 11 | https://apps.apple.com/us/app/id6757397729 | Get Gone!: $2.99, Pro paywall on plan, export and share; multiplier | Live (browser) |
| 12 | https://apps.apple.com/us/app/id6758438106 | Vacation Maximizer: free, tracking data, too few ratings | Live (browser) |
| 13 | https://www.g2.com/products/leavewise/reviews | LeaveWise is B2B, no reviews | Search result only |
| 14 | https://www.forbes.com/sites/baileyberg/2026/11/19/want-more-vacation-time-in-2027-take-these-days-off/ | 2027 holiday structure, 11→44, year-end 4→10, no tool cited | Live (browser; WebFetch 403) |
| 15 | https://www.forbes.com/sites/brittanyanas/2026/01/05/maximize-pto-in-2026-how-to-turn-14-pto-days-into-46-vacation-days/ | Recurring January publisher pattern | Search result only |
| 16 | https://www.forbes.com/sites/brittanyanas/2024/12/18/how-to-turn-15-pto-days-into-51-vacation-days-in-2025/ | Recurring December pattern (2025 edition) | Search result only |
| 17 | https://www.cnbc.com/2026/01/19/how-to-make-the-most-of-your-pto-and-vacation-time-this-year.html | "PTO-maxxing" framing, no tool cited | Live |
| 18 | https://fortune.com/2026/05/27/how-to-max-out-paid-time-off-in-2026-pto-maxxing/ | Summer wave; Blink data; TikTok parent example; Pew/Expedia/SHRM stats | Live |
| 19 | https://upgradedpoints.com/news/maximize-pto-days-2027/ | 11→44 in 2027; affiliate monetization | Live |
| 20 | https://secretnyc.co/how-to-maximize-pto-2027/ | 2027 local-publisher pickup (Nov 19 2026), no tool | Live |
| 21 | https://www.travelpirates.com/captains-log/how-to-maximize-your-vacation-days-in-2027 | Month-by-month format; March, April and August without federal holidays | Live |
| 22 | https://www.axios.com/2025/12/23/2026-vacation-holidays-pto | December publisher pattern | 403; title and date from search only |
| 23 | https://suggestqueries.google.com/complete/search?client=firefox&hl=en&gl=us&q=… | All autocomplete observations in §4 | Live (browser) |
| 24 | https://www.pewresearch.org/social-trends/2023/03/30/how-americans-view-their-jobs/ | 46% take less PTO than offered; reasons; survey dates and N | Live (browser) |
| 25 | https://www.ustravel.org/sites/default/files/media_root/document/2018_Research_State%20of%20American%20Vacation%202018.pdf | 52% unused, 705M days, 212M forfeited, $62.2B; planners 53% vs 43% | PDF text extracted locally; HTML pages 403 |
| 26 | https://www.going.com/how-it-works | Going tiers $0/$49/$199, alerts, trial, referral program | Live |
| 27 | https://www.tripit.com/web/pro | TripIt Pro $49/yr, Inner Circle sharing | Live |
| 28 | https://flighty.com/pricing | Flighty Pro pricing, free Passport and Friends | Live |
| 29 | https://www.endlesstravelplans.com/guides/planning-tools/wanderlog-review | Wanderlog Pro about $39.99/yr, collaboration free | Search result only (wanderlog.com/pro rendered no content) |
| 30 | https://www.notion.com/help/guides/getting-started-as-a-template-creator-on-marketplace | Template marketplace; creator self-promotion matters | Search result only |
| 31 | https://doi.org/10.1037/0003-066X.54.7.493 | Gollwitzer 1999 | Crossref metadata verified |
| 32 | https://doi.org/10.1016/S0065-2601(06)38002-1 | Gollwitzer & Sheeran 2006 (94 studies, d = .65 via secondary sources) | Crossref verified |
| 33 | https://doi.org/10.1073/pnas.1103170108 | Milkman et al. 2011: date-and-time prompt +4.2 points | Crossref abstract |
| 34 | https://doi.org/10.1037/0022-3514.79.6.995 | Iyengar & Lepper 2000 | Crossref verified |
| 35 | https://doi.org/10.1086/651235 | Scheibehenne et al. 2010: mean effect about zero | Crossref plus repository snippets |
| 36 | https://doi.org/10.1126/science.1091721 | Johnson & Goldstein 2003 | Crossref verified |
| 37 | https://doi.org/10.1002/ejsp.674 | Lally et al. 2010: 18–254 days | Crossref abstract |
| 38 | https://doi.org/10.1509/jmkr.48.5.869 | Berger & Schwartz 2011: cues drive ongoing word of mouth | Crossref abstract |
| 39 | https://doi.org/10.1509/jm.75.1.46 | Schmitt, Skiera & Van den Bulte 2011: at least 16% more value | Crossref abstract |

**Not verified / Unknown:**
- Any search volume.
- Reddit thread content (blocked).
- Holiday Optimizer's export price and the source of its press logos.
- Stretch My Time Off's current features (blocked).
- U.S. Travel data after 2018, and the 768M figure from a primary page.
- Axios article content.
- Going referral program terms.
- Whether any competitor gets meaningful traffic.

---

## 8. Five most important lessons, ranked by likely business impact

1. **Ship the 2027 landing pages now, with plans you can reproduce. The publisher wave peaks between now and mid-January.** (Observed: Forbes on Nov 19, Secret NYC on Nov 19, Upgraded Points on Nov 18, Forbes and CNBC in January. Holiday Optimizer has been live since June.)
   - Build `/2027` (or `/maximize-pto-2027`) with US plans for 10, 15 and 20 PTO days.
   - Show each plan two ways: on the **federal list** and on a **typical private-employer list** (the gap between them is the hook). Each plan should be a deep link to the exact Timebower URL, with a CSV/Sheets download.
   - Use the words people search with: "maximize PTO 2027", "best days to take off 2027" and "2027 PTO calendar". Do not say "bridge days".
   - Prerequisite: fix the production deploy and freshness (BASELINE). A page with stale dates in this window costs trust.
2. **Lead with getting the request approved, not with the math.** The math is a commodity offered free by at least six tools. Pew's top barriers are falling behind (49%) and coworkers (43%), not arithmetic. "How to ask for PTO" and "pto request email template/example/to manager" are live, year-round autocomplete intents (Observed).
   - Build an evergreen "PTO request email template" page.
   - It should generate the text from the user's actual dates and ask-by date.
   - This is the one job no competitor seen does.
3. **Make the ask-by date a timed calendar event.** That gives Timebower a return trigger without accounts.
   - Implementation intentions with a specific date and time beat a date alone (Milkman: +4.2 vs +1.5 points). Annual tasks will not become habits (Lally).
   - The ICS should include a timed "Send PTO request for Nov 20–28" event and expiry warnings.
   - This is Going's "the alert is the product" model, delivered through the user's own calendar. It also drives the next visit, which today depends on memory.
4. **Win the citation slot.** Journalists rerun this story every year, and most name no tool (Observed: Forbes 2027, CNBC, Upgraded Points, Secret NYC, Travel Pirates).
   - Offer a press-ready page: methodology, "same inputs, same plan", 10/15/20-day plans in both employer variants, honest calendar-days caveats in the style of Vacation Tracker's, and a contact address.
   - Then pitch that page to the writers who covered 2026, and do a Show HN-style launch. Stretch My Time Off got 358 points and 174 comments, and those comments ask for features Timebower already has.
   - This needs the owner. Timebower currently has no support email under its own name, and that blocks it (BASELINE).
5. **Grow through two-person and family planning, and measure it.** Partner overlap and the school-break planner are Timebower's only features with sharing built in.
   - Cue-driven sharing lasts (Berger & Schwartz), and referred users are worth at least 16% more (Schmitt et al.). Every competitor's share is one-to-many or paywalled (Get Gone).
   - Make "send this to your partner to add their dates" the primary share, and keep it free, as Wanderlog keeps collaboration free.
   - Before any channel test, add privacy-safe source attribution: a coarse `ref` or channel bucket kept even though full query strings are stripped. Without it, none of lessons 1–4 can be evaluated. Today no acquisition source is recorded (BASELINE).
