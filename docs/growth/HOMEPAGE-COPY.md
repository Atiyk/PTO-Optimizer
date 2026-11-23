# Homepage copy recommendations

Against the live homepage and `src/ui/Landing.tsx` / `index.html` as of 2026-11-22. Copy only: implementation belongs to the product team (no code was changed). Keep `docs/VOCABULARY.md`: "days off" means calendar days including weekends and holidays, "PTO days" is the cost, and "vacation days" is not used in UI strings.

## What the page says today

| Element | Current copy | Problem |
| --- | --- | --- |
| H1 (`Landing.tsx` line 184) | Time off that fits your year. | Doesn't mention PTO, dates, holidays or requests. A first-time visitor can't tell what the tool does until they read the plan card. |
| Subhead | none; the H1 goes straight into "I have [15] PTO days in [United States]." | The input sentence is good, but nothing says why to fill it in. |
| Under the button | Free, no account needed. | Good. Keep. |
| Starting-guess line | A starting guess: 15 PTO days and United States holidays. Change either to match yours. | Good. Keep. |
| Section 2 H2 | Plan the breaks, then keep track of the days. | Fine; slightly abstract. |
| Last section H2 | Same inputs, same plan. | Good trust line. Keep. |
| `<title>` | Timebower — Plan and track your time off | No search terms people use in December ("2027", "days off", "holidays"). |
| Meta description | Find longer breaks, customize employer holidays, track PTO requests, and forecast your balance. Plan your 2027 time off and any date range. Free, no sign-up. | A feature list; 157 characters; "2027" is buried. |
| OG image | More days off from the same PTO. / Timebower finds where your PTO joins weekends and public holidays into the longest breaks. | Fine. Optional refresh below. |

The plan card already does the heavy lifting: with the defaults it shows "31 days off / 13 PTO days + 18 weekend and holiday days, across 4 breaks" and the four dated breaks. The headline's job is only to say what the card is and what happens next.

## Options (3)

### Option A (ship this)

- **H1:** Find your best days off.
- **Subhead:** Put in your PTO days. Timebower lines them up with weekends and 2027 holidays, shows exactly which days to request, and writes the note to your manager.
- **Keep below the button:** Free, no account needed.

Why: it is the owner's preferred voice without the overpromise ("get them approved"), it names the three jobs in order, and every claim in it is something the page does. 24 characters for the H1 keeps the compact display type from `BRAND-IDENTITY.md`. "2027" in the subhead is the seasonal hook; switch it to "2028" in the fall of 2027 (or derive it from the planning range, product team's call).

### Option B (numbers-first)

- **H1:** Which days should you take off in 2027?
- **Subhead:** Put in your PTO days and see the exact dates, built around weekends and holidays, plus a request you can send your manager.

Why not first: the question form is strong for search and social but dates the page hard (must change every year) and reads like an article title.

### Option C (differentiator-first)

- **H1:** The days to request, not just a number.
- **Subhead:** Timebower turns your PTO and your company's holidays into dated breaks, an ask-by date and a message for your manager.

Why not first: it only makes sense if the reader has seen another calculator. Better as the launch-post line.

Rejected: "Turn 15 PTO days into 31 days off." It would be wrong for most visitors, because the plan changes with country, date range and employer holidays, and the H1 is static.

## Other before/after lines

| Where | Before | After |
| --- | --- | --- |
| Plan card button | See the full plan → | Keep. Clear and tested. |
| Holiday check summary | Assumes you get all 11 US public holidays off in these dates. | Keep. Consider adding one short line under it in December: "Not sure? Check which ones your company gives you." (the "Check company holidays" toggle already exists; this only makes it more prominent) |
| Section 2 H2 | Plan the breaks, then keep track of the days. | Plan your breaks, ask for them, and keep PTO from expiring. |
| "Check my policy" row body | Accrual, carryover and expiry deadlines, with calendar reminders before days lapse. | Keep; for December, the row title could read "Don't lose PTO at year end" (uses the owner's "don't waste your PTO" idea in plain words). Note "lapse" is fine; "expired days" is a banned alternative only as a noun phrase. |
| OG image alt (`index.html` line 33) | Timebower: more days off from the same PTO. | Keep, or match the H1: "Timebower: find your best days off." |

## Meta title and description

Title (aim under 60 characters, front-load the searched words):

1. **Timebower: Find your best days off in 2027** (42 chars) ← recommended
2. 2027 PTO planner: best days to take off | Timebower (51)
3. Plan 2027 time off around holidays | Timebower (46)

Description (aim 140 to 155 characters):

1. **See which days to take off in 2027. Timebower joins your PTO to weekends and your company's holidays, then writes the request. Free, no account.** (144) ← recommended
2. Put in your PTO days and get dated 2027 breaks, an ask-by date and a message for your manager. Uses your employer's holidays. Free, no sign-up. (143)

Use the same pair for `og:title` / `twitter:title` and the descriptions, as `index.html` does now. Search engines may rewrite either; that's fine.

## Microcopy notes for the product team

- The request text in `src/ui/requestText.ts` says "N days away from work in total". "Days away" is on the banned list in `docs/VOCABULARY.md`; "N days off in total" matches the rest of the site.
- Wherever a total like "31 days off" appears in marketing, put "for 13 PTO days" right next to it. The site already does this; the marketing kit follows the same rule.
