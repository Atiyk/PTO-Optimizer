# Timebower positioning (US, 2027 planning season)

Written 2026-11-22 for the launch-readiness branch. Scope: the consumer app only (`apps/teams` is B2B and out of scope). There are no users, interviews, testimonials or press yet, so everything about audience behaviour below is a hypothesis to test in the interviews at the end of this doc.

## The one-liner

**Timebower shows you which days to take off so your PTO joins weekends and holidays into the longest breaks, then writes the request to your manager.**

Short form for bios and link previews: *Find your best days off, ask for them in one message, and don't let PTO go to waste.*

Why this version: it says what goes in (your PTO), what comes out (exact dates, a request), and the mechanism (weekends and holidays) in one sentence. It avoids "optimize" and "maximize", which every competitor uses, and makes no claim the engine can't back.

## Proof points we can actually show

Each one is a Timebower output from the live site on 2026-11-22, assuming a Monday to Friday workweek and that the employer observes all 11 US federal holidays (the planner's default; users can change it).

| Input | Timebower output |
| --- | --- |
| 15 PTO days, US, homepage default range (Nov 22, 2026 to Nov 21, 2027) | 31 days off across 4 breaks for 13 PTO days: Jan 16 to 24 (4 PTO), May 28 to 31 (1), Jun 12 to 20 (4), Sep 4 to 12 (4) |
| 10 PTO days, US, Jan 1 to Dec 31, 2027 (`/pto?c=US&s=2027-01-01&e=2027-12-31&b=10`) | 27 days off across 7 breaks for 7 PTO days, 3 kept in reserve. Includes Thanksgiving: Nov 25 to 28 for 1 PTO day (Fri Nov 26) |
| 15 PTO days, US, Jan 1 to Dec 31, 2027 | 44 days off across 12 breaks for 12 PTO days, 3 kept in reserve |

Hand-checked 2027 examples (dates and weekdays verified with `node` Date and against OPM's 2027 federal holiday list):

- Thanksgiving: Thu Nov 25 is the holiday. Take Fri Nov 26: Thu Nov 25 to Sun Nov 28, 4 days off for 1 PTO day.
- MLK Day: Mon Jan 18. Take Tue Jan 19 to Fri Jan 22: Sat Jan 16 to Sun Jan 24, 9 days off for 4 PTO days.
- July 4 falls on Sunday, observed Mon Jul 5. Take Tue Jul 6 to Fri Jul 9: Sat Jul 3 to Sun Jul 11, 9 days off for 4 PTO days.
- Christmas falls on Saturday, observed Fri Dec 24. New Year's Day 2028 falls on Saturday, and the federal observed day is Fri Dec 31, 2027. If your employer observes both Fridays, Mon Dec 27 to Thu Dec 30 (4 PTO days) gives Fri Dec 24 to Sun Jan 2, 10 days off. Many private employers don't shift Saturday holidays to Friday, so this one needs the "check your company holidays" caveat every time.

Always state the assumption. Juneteenth, Columbus Day and Veterans Day in particular are observed by far fewer private employers than by federal agencies.

## Audience

Primary: salaried US employees with roughly 10 to 20 PTO days who plan their year in December and January, when the new holiday calendar is fresh and requests go in early.

| Sub-segment | What triggers them | Lead message | Where to reach them |
| --- | --- | --- | --- |
| New grads and first-job employees with 10 days | First full year of PTO; don't know bridge days exist; nervous about asking | "Have 10 PTO days? 7 of them give you 27 days off in 2027, with 3 left over. Here's which to request." | r/newgrads-type communities, career newsletters, short video |
| People with PTO expiring Dec 31 | Forfeiture deadline in weeks | "You have until Dec 31. Here's where 3 leftover days still fit." | December search, Reddit threads about use-it-or-lose-it, `/policy` expiry guard |
| Parents | School breaks dictate the dates | "Line your PTO up with your district's 2027 school breaks." (`/family`, 12 US district calendars) | Parent newsletters, local parent groups (ask admins first) |
| Couples / two-earner households | Two different PTO balances and holiday lists | "Find dates you can both take off, without sharing your balance." (partner planning) | Short video, shareable plan links |
| Planners with a big trip in mind | One long trip | "Where 2027's holidays make the longest single break." | Travel newsletters, r/travel-type threads (value-first) |

Start with new grads and expiring-PTO people. They have the sharpest, most time-bound need, and the product answers it in one screen.

## Differentiation

A quick search on 2026-11-22 found several tools doing the bridge-day idea: Holiday Optimizer (web), Vacation Optimizer on rapidtoolset.com, the iOS apps Vacation Maximizer and Get Gone, a "2025 PTO Optimizer" on Product Hunt, and every-year editorial pieces such as "stretch 11 PTO days into 41 days off" (AOL) and FareCompare's PTO guide. We have not tested those tools in depth, so the comparison below is about what Timebower does, not claims about what they lack.

What Timebower can say truthfully:

1. **Deterministic and reproducible.** Same inputs, same plan. Every input lives in the link, so a shared plan opens exactly as you saw it.
2. **Request-ready.** Each break lists the exact working days to request, an ask-by date from your notice period, and copyable text for your manager. Then you mark it requested and approved.
3. **Your employer's holidays, not just the federal list.** Uncheck holidays you work, add company days such as the day after Thanksgiving. Most "X PTO days into Y days off" articles assume every federal holiday.
4. **Honest counting.** "Days off" includes weekends and holidays, and the page says so next to the number. We never present 31 days off as 31 days of PTO.
5. **No signup, free.** Works signed out; personal settings stay in the browser.
6. **Keeps the plan true afterward.** Balance forecast, expiry reminders (.ics), partner overlap, school breaks.

The competitive line to use: *Other calculators tell you a number. Timebower tells you which days to put in the request.*

## Candidate messages, scored skeptically

Scores 1 to 5. Clarity = a stranger gets it in 5 seconds. Believability = would a skeptical person accept it without clicking. Specificity = names a concrete outcome. Differentiation = a competitor couldn't paste it unchanged.

| # | Message | Clarity | Believable | Specific | Different | Total | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Time off that fits your year. (current H1) | 2 | 4 | 1 | 1 | 8 | Pleasant, says nothing about PTO, dates or holidays |
| 2 | 7 PTO days, 27 days off in 2027 (and 3 days left over). | 5 | 3 | 5 | 2 | 15 | Strong hook; every competitor uses the same "N into M" shape and readers discount it. Use in posts, not the H1. Never write "10 into 27": the plan spends 7 |
| 3 | Find your best days off. Ask for them in one message. Don't waste your PTO. | 4 | 4 | 3 | 4 | 15 | Close to the owner's voice; three jobs in nine words |
| 4 | More days off from the same PTO. (current OG image) | 4 | 3 | 2 | 2 | 11 | Clear but generic |
| 5 | Which days should you take off in 2027? Put in your PTO and see. | 5 | 5 | 3 | 2 | 15 | Good search/SEO title; weak as a brand line |
| 6 | Other calculators give you a number. Timebower gives you the dates to request. | 4 | 4 | 3 | 5 | 16 | Best differentiator; comparative framing is risky on the homepage, fine for launch posts |
| 7 | Plan 2027 around your company's holidays, not a generic list. | 3 | 5 | 3 | 4 | 15 | Strong for HR-savvy readers; narrower |
| 8 | The PTO planner that writes the request for you. | 4 | 4 | 3 | 4 | 15 | Clear category plus a feature; "writes the request" may sound like it sends it |

**Winner for the homepage: #3**, adapted (see `HOMEPAGE-COPY.md`). It matches the requested voice, covers the full job (find, ask, use), and the live plan card next to it supplies the numbers that #2 relies on. Use #6 as the launch-post line and #2/#5 as hooks and titles.

Two copy warnings:
- "Get them approved" overpromises: the manager approves, Timebower writes the request and tracks status. Use "Ask for them" or "Request them in one message".
- `docs/VOCABULARY.md` bans "vacation days" in UI strings. It is fine in search titles and social posts (people search for it) but not in the H1 or other interface copy.

## Launch narrative

Every December, people get next year's holiday calendar and a fresh PTO balance and try to work out the best days to take off, usually in a spreadsheet or from an article that assumes they get every federal holiday. 2027 is an awkward year: July 4 and Christmas both land on weekends, Juneteenth lands on a Saturday, and whether you get the Friday or Monday off depends on your employer. Timebower takes your PTO balance and your company's actual holidays and shows the exact days to request, the date to ask by, and a message to send your manager. Same inputs, same plan, free, no account.

## Channels

Measurement gap first: `BASELINE.md` notes that analytics strips UTM and all query parameters, so acquisition source is not recorded. Before any channel push, the owner needs at least referrer data in Plausible (see `MARKETING-KIT.md` launch checklist). Without it, every channel below is unmeasurable.

| Channel | Use? | Why | Why not / risk | Signal it worked |
| --- | --- | --- | --- | --- |
| SEO: 2027 holiday and long-weekend pages | **Yes, #1** | People search "2027 long weekends", "best days to take off 2027", "Thanksgiving 2027 PTO" in Dec and Jan; the engine already generates the answer; pages compound for years (2028 next) | No 2027-specific pages exist today; new domain on vercel.app has little authority; pages must be built by the product team | Search Console impressions for 2027 queries by mid-January |
| Reddit and community value posts | **Yes, #2** | The target audience asks these questions in public threads in December; a worked answer with dates is useful with or without a link | Most finance and career subreddits ban self-promotion; one bad post can burn the brand; must disclose affiliation | Replies that ask follow-up questions; referrals from reddit.com |
| Newsletter and press seasonal stories | **Yes, #3** | Editors run the "turn N PTO days into M days off" story every year (AOL and FareCompare pieces exist for 2026); we can offer correctly counted 2027 numbers with the employer-holiday caveat | Cold pitches get ignored; needs a real contact address under the Timebower name first | One placement or newsletter mention; referral traffic spike |
| Short-form video demos of calculations | Yes, after the first three are running | Calendar math is visual; a 30-second "here's the 4 days to take" works on TikTok, Reels, Shorts | Needs accounts and steady posting; output must be correct every time | Saves and shares per video; profile link clicks |
| Shareable plans (links, image, portrait card) | Product loop, not a channel | Already built; every shared plan is an ad with real numbers | Only works once people use it; can't push it | Share-link opens (needs an event if not tracked) |
| Product Hunt / Show HN | One-off, January | Cheap credibility, feedback from builders | Audience is not the core customer; spikes then drops | Comments with product feedback |
| Paid ads, influencers on paid deals | No | $0 budget | | |

## Monetization hypotheses (brief; `MONETIZATION.md` owns this)

1. The consumer planner stays free; free and no signup is part of the positioning.
2. Optional paid convenience later: email reminders before ask-by dates and expiry deadlines, cross-device sync. Test willingness to pay in interviews before building.
3. B2B lead source: people who like planning their own PTO may bring Timebower to their team (`apps/teams` exists). Track "my manager / my team" mentions in interviews.
4. Travel affiliate links are possible but put the neutral, honest tone at risk; test only after trust exists, and label them clearly.

## Customer interview plan

Goal: 10 to 15 conversations with salaried US employees with 10 to 20 PTO days, before or during the December push, to find out how they plan today and what would make them trust and return to Timebower.

**Recruiting without spend**
- Personal network second-degree intros ("know anyone who just started their first salaried job?").
- People who reply to value posts on Reddit or in communities: offer a 20-minute call, no incentive except a hand-checked plan for their year. Follow each community's rules on DMs.
- A one-line "Help shape Timebower: 20-minute call" link in the footer or after a plan is copied, once the owner sets up a scheduling page. [OWNER: set up a scheduling link and a Timebower contact email]
- Aim for at least 4 new grads, 3 people with PTO expiring Dec 31, 3 parents, 2 couples.

**Screener (5 questions)**
1. Are you a salaried employee in the US? (must be yes)
2. Roughly how many PTO days do you get a year? (10 to 20 preferred)
3. When did you last plan or request time off? (within the last 6 months preferred)
4. Who approves your time off? (manager, HR system, nobody)
5. Does your employer give you all federal holidays off? (yes / some / don't know: "don't know" is a valuable answer)

**Script (non-leading)**
1. Walk me through the last time you took more than two days off. How did you pick the dates?
2. What did you use to plan it, if anything? Show me if you can.
3. How did you ask for the time? What did you write, and to whom?
4. What happened between asking and hearing back?
5. Tell me about a time you lost PTO, or nearly did. What happened?
6. Which holidays does your company actually give you? How do you find out?
7. When in the year do you think about next year's time off?
8. If you share time off with a partner or kids' schedules, how do you line them up?
9. (After showing a Timebower plan for their inputs) What here would you check before trusting it?
10. What would you do with this plan next? Who, if anyone, would you show it to?
11. What would make you come back to this in March or June?

**What would change decisions**
- If most people don't know which holidays their employer observes, the employer-holiday step moves up and becomes the lead message.
- If the request text gets no interest ("I just put it in Workday"), drop "ask for them" from the headline and lead with dates and expiry.
- If expiry is the strongest pain, the December campaign leads with `/policy` and "Don't waste your PTO".
- If people distrust the "days off" number, change how it's presented (lead with PTO dates, not totals).
- If several mention their team or manager wanting it, raise the priority of the B2B path.
