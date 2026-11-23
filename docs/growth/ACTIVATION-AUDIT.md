# Activation audit: first visit, share, return (2026-11-22)

Agent C+D (activation, conversion, retention, natural sharing), branch `growth/wt-ux`.
Method: a production build of this branch (`npm run build`, `vite preview` on :4312) driven
in Playwright Chromium at 375x812 and 1440x900. Contexts were fresh, service workers were
blocked, and third parties were stubbed. Each line is **Observed** unless it says otherwise.
The script lives outside the repo; screenshots are in `docs/screenshots/growth-ux/`.

## Journey walked

| Step | What a stranger sees | Evidence |
| --- | --- | --- |
| Homepage, first 5 s | H1 "Time off that fits your year.", the sentence "I have [15] PTO days in [United States].", a plan card with "31 days off / 13 PTO days + 18 weekend and holiday days, across 4 breaks", the calendar-days explainer, "See the full plan →", then the holiday assumption. The page doesn't say what the tool does until you read the card. | `before-home-375.png`, `before-home-1440.png` |
| Edit PTO balance + country | Typing 20 and choosing the UK re-plans live: "38 days off / 18 PTO days + 20 …". No submit step. | audit log |
| Check employer holidays | "Assumes you get all 11 US public holidays off in these dates." sits under the CTA. One tap opens the chips and each chip re-plans. The count is visible. | `before-home-holiday-check-open-375.png` |
| Understand the recommendation | The four breaks are listed with days off · PTO days, and the year line is shown. **The 2 entered PTO days that aren't planned (15 entered, 13 used) aren't explained anywhere on the homepage.** The planner explains it ("18 of 20 PTO days planned · 2 kept in reserve"), but only after the click. | `before-home-375.png`, audit log |
| Next real action | Nothing on the homepage connects the plan to a date to act on. The ask-by date only appears inside each planner break's request panel. | audit log |
| Open full planner | The CTA keeps `ps=year`, `pv=2`, `rv=0` and `lp=1`. The planner shows the same 38 days / 18 PTO days / 4 breaks as the card (parity holds). | `before-planner-375.png` |
| Share | "Copy plan link" sits behind "More: download, share, subscribe". The copied link is `…/pto?sv=1&c=GB&s=…&e=…&b=20&w=30&count=0&mb=3&rv=0&pv=2&ps=year&er=2&hf=…`, with no private keys. | `before-planner-share-375.png` |
| Open shared link (fresh context) | Same plan (38 days off). The notice "This is a shared plan, built from the settings in the link…" sits under the result and share controls. It never says someone sent it, and it offers no way to make the plan your own (the only button appears when a saved calendar is off). | `before-shared-recipient-375.png`, `before-shared-notice-375.png` |
| Return (reload with localStorage) | "Welcome back / Next break: Dec 25, 2026 – Jan 3, 2027 / Considering · 3 PTO days / Copy request". **The break saved with "Save break" (status Considering) shows no request-by date or reminder.** Only plan breaks and "Planned" requests got one. The dashboard does say "Saved on this device". | `before-returning-375.png` |

No horizontal overflow at 375 or 1440 (`scrollWidth − innerWidth = 0`).

## Observed issues

| # | Issue | Severity | Type |
| --- | --- | --- | --- |
| 1 | The homepage plans 13 of 15 entered PTO days and says nothing about the other 2. The year style holds back `autoReserveDays` (1 for 8–14 days, 2 from 15; `src/planning/yearPlan.ts`), and the card reads like a mistake or a hidden cap. | High (trust in the number) | Bug in explanation |
| 2 | No next action: the plan doesn't connect to "ask by" on the first screen, even though the request-by rule exists (`requestDeadline`). | Medium | Opportunity |
| 3 | Returning dashboard: "Considering" requests (what "Save break" creates) get no request-by date and no reminder, so the most common saved state leads with no deadline. | Medium | Bug |
| 4 | Shared-link recipient: no "someone shared this with you" framing and no one-tap way to make the plan theirs. | Medium (sharing loop) | Opportunity |
| 5 | The H1 doesn't say what the tool does (positioning agent's HOMEPAGE-COPY.md, Option A). | Medium | Opportunity |
| 6 | The request text says "N days away from work in total". "Days away" is banned by `docs/VOCABULARY.md`. | Low | Bug (copy) |
| 7 | The holiday assumption count is already visible next to the result, and verification is one tap. | n/a | Already good, no change |
| 8 | Calendar days vs PTO days: the card already pairs "31 days off" with "13 PTO days + 18 weekend and holiday days" plus an explainer. Nobody was confused once the reserve was explained. | n/a | No change |
| 9 | First screen: the slider and date pickers sit beside or below the card; at 375 the CTA is in the first viewport. No clutter worth removing without losing features. | n/a | No change |

### Coordinator follow-ups (reproduced on this branch's build of main)

- **`ps=year` dropped (reported bug).** Doesn't reproduce with homepage-generated links: `/pto?c=US&b=15&s=…&rv=0&pv=2&ps=year&mb=3&lp=1&w=30&count=0` keeps `ps=year` and shows 31 days off, the same as the card. It *does* drop `ps` when a link carries `ps` without `pv=2` (`/pto?c=US&b=15&ps=year` → `?w=30&count=0&c=US&…`, 44 days off, Custom). That's the intended legacy rule: without `pv=2` a link reproduces the legacy engine, and `buildPublicPlanSearch` also writes `ps` only with `pv=2`. The app never writes `ps` without `pv=2`, so only hand-written links are affected. Not changed; owner call.
- **Bare `/pto` vs homepage.** On main a bare `/pto` opens on "Spread across the year" and shows **31 days off / 13 PTO days**, the same as the homepage. The "44 days off, 12 long weekends" number appears only for links with planning parameters but no `pv`/`ps` (old links, by design, per FABLE-HANDOFF.md). Production may still show the old behaviour because it is behind main. Not changed.

## What changed (this branch)

| Finding | Change | Files |
| --- | --- | --- |
| 1 Reserve unexplained | Under the action, the card now says: "2 PTO days left unplanned, kept for sick days or last-minute plans. Change this in the planner". The count is the solver's `meta.reserveKept`. Days that don't fit a break are reported separately ("…, 3 that don't fit a break in these dates"). The line is absent when every entered day is planned. The link opens the planner's options (`#planning-assumptions`). | `landingState.ts` (`landingPtoAccounting`, `reserveSentence`), `Landing.tsx` |
| 2 No next action | "Next step: **Ask by Tue Jan 5** to take Jan 16 – 24, 2027 off, if your employer wants 14 days' notice." It uses the same `requestDeadline` as the planner's request panel, with the preview's own settings (14 calendar days, Mon–Fri, the preview holidays as days off). Checked in the browser for GB 20, US 15, DE 25 and US 8: the homepage date equals the planner's first `[data-request-deadline]` every time. | `landingState.ts` (`landingNextRequest`, `PREVIEW_NOTICE_DAYS`), `Landing.tsx` |
| 4 Shared-link framing | The notice now leads with "Someone shared a time-off plan with you." It says the plan is built from the PTO days, country, dates and holidays in the link, says private settings aren't included, and offers one action, "Use my own PTO days" (focuses and selects the planner's PTO field, `shared_plan_made_own`), plus a "Check your company holidays" link. It still names no sender value. | `SharedPlanNotice.tsx` |
| 5 H1 | "Find your best days off." with the HOMEPAGE-COPY.md Option A subhead. "2027 holidays" became "public holidays": the range and country vary, so a fixed year would be wrong for some visitors. On phones shorter than 740px the subhead is hidden so the action stays clear of the tab bar. | `Landing.tsx` |
| 6 Vocabulary | Request text: "N days away from work in total" → "N days off in total". | `requestText.ts` (+ test) |
| Analytics | `holiday_check_opened` (once per document, on open), `landing_plan_opened` (CTA click), `shared_plan_made_own` (once per document), `request_text_copied` (RequestPanel copy of any variant, dashboard copy), `ICS downloaded` (RequestPanel .ics), `returned_with_saved_url` via `trackReturnOncePerSession('', true)` on dashboard mount. Event names only. | `Landing.tsx`, `SharedPlanNotice.tsx`, `RequestPanel.tsx`, `ReturningDashboard.tsx`, `analytics.ts` (union lines only) |

Not changed:
- **3 "Considering" without a date (deferred, owner decision).** I implemented and then reverted it. N-P1-2 (PR #150, `returnVisit.ts`) deliberately gives a "Submit by" date only to *Planned* requests, so the homepage dashboard and the My PTO tracker always agree; `Landing.test.tsx` "shows no date for a break still being considered, as the tracker does" encodes that rule. Changing it on the dashboard alone would split the two surfaces. Recommendation: give "Considering" a soft "Ask by" in both places, or have "Save break" record *Planned*.
- Calendar-days wording, the holiday count and first-screen controls (findings 7–9) were already right.

## Evidence after the change

- Overflow: `scrollWidth − innerWidth = 0` at 320, 375, 390, 768, 1024 and 1440, for the homepage and the shared-link recipient.
- The action stays in the first screen at every width. At 320x568 its bottom is 513px, the same as before the change. It already sat 2px under the 511px tab bar top before this branch; that's a pre-existing issue and isn't made worse.
- Touch targets: no new control under 44px. The only inline links are the reserve link and the notice's holiday link, which `min-h-11` keeps at 44px; inline-in-sentence links are exempt under WCAG 2.5.8. The reserve link shows a 2px solid focus outline (`after-home-reserve-focus-375.png`). Pressing Enter on "Use my own PTO days" moves focus to "PTO days available"; "Check your company holidays" opens the planner options.
- Recipient privacy: the sender unchecked a holiday before copying. The link carries only public keys, and the recipient's page doesn't contain the sender's private data. Unit coverage: `publicSharePrivacy.test.ts` sets every `PLAN_PRIVATE_KEYS` key to a sentinel and asserts none reach the link or the recipient's state. `SharedPlanNotice.test.tsx` asserts the notice repeats no dates or policy terms.
- Browser QA against this build: `consumer-journey.mjs` 24/24 passed, `consumer-qa.mjs` 60/60 route and viewport checks passed, `consumer-plan-parity-qa.mjs` passed (homepage → planner → reload → fresh-browser share are all 31 days off / 13 PTO days with the same four breaks), `consumer-privacy-qa.mjs` 6/6 passed.
- Screenshots: `docs/screenshots/growth-ux/after-home-{320,375,390,768,1024,1440}.png`, `after-shared-notice-{320,…,1440}.png`, `after-shared-made-own-375.png`, `after-home-reserve-focus-375.png`, `after-planner-375.png` and `after-returning-375.png`. The `before-*` set is from the unmodified build.
