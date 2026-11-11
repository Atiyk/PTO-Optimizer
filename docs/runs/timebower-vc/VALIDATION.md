# Timebower product validation plan

## Funnel and eligibility

| Measure | Trigger | Denominator and limits |
| --- | --- | --- |
| First break saved, tracked, exported or shared | First successful explicit break action of each type in that browser | Eligible visits where a valid break and that action are available. Use aggregate page and event counts until eligibility and unique browsers can be measured without joining private data. |
| Second meaningful break action | The browser records a second distinct successful break action type | Compare against browsers with at least one meaningful action where supported. Repeat clicks of one type do not count. Browser resets, tabs and storage restrictions affect counts. This is depth of use, independent of elapsed time. |
| Partner reply | A recipient successfully creates a return proposal | Compare aggregate return proposals against eligible proposal opens. A copied link does not prove delivery or acceptance. Do not join sender and recipient. |
| Listed family coverage confirmed | A parent explicitly confirms care for the reviewed closure list after the product finds zero uncovered or tentative dates | Eligible plans have at least one listed closure and a verified work and holiday calendar for those dates. Report confirmation only for the listed closures. Partial school data cannot establish full-year coverage. |

Log fixed event names and public route only through the existing sanitized analytics path. Never attach dates, balances, salary, employer or school names, request notes, calendar data, proposal links, query strings, fragments, stable browser identifiers or cross-user identifiers. Store only the set of action types locally for the milestone. Run the privacy transport fixture before release.

Report counts by observable route and supported acquisition channel when volume and consent allow. Use Family as a route-based proxy for parents and the partner recipient flow as a route-based proxy for partner intent. A general planner visitor may belong to any group. Keep that cohort unknown unless they explicitly choose a path. Use provider-supported aggregate acquisition reports, leaving unsupported cuts blank. Keep opens, actions, and unique visitors distinct. No baseline funnel or willingness-to-pay results have been measured for this batch.

## Reviewable experiments

| Experiment | Hypothesis and comparison | Evidence to advance | Stop rule |
| --- | --- | --- | --- |
| Working parents, couples and solo planners | Give each group a synthetic but realistic schedule. Compare the existing calculator entry with its relevant entry path. Keep the budget and workweek fixed within each comparison. | Time to first feasible break or coverage plan, completion, correct recall of dates and costs, second useful action and ability to resume. In an initial moderated round, aim for four of five per group to reach the intended result without help and zero incorrect decisions caused by the UI. | Stop on a private data exposure or a materially wrong plan. Treat small samples as qualitative. Do not rank segments from sparse event counts. |
| Holiday and school landing pages | Compare a focused page for one holiday and one verified district with the general homepage, keeping the promise and traffic source visible. | Compare eligible visits and first meaningful actions by entry route and channel. Include confidence intervals and review across equivalent weeks before expanding coverage. | Stop if date provenance cannot be verified, the pages lower result accuracy, or the narrow page produces clicks without meaningful actions. |
| Reminder timing | Test synthetic calendar reminders at request lead time, pre-expiration, and a self-selected date. Compare a preview without reminders and compare user expectations about when reminders happen. | Voluntary setup, correct understanding of timing, useful return within the relevant planning window and fewer missed simulated deadlines. | Stop on misleading alert dates, unwanted notifications or handling that requires sending private dates to an unapproved service. |
| Willingness to pay | Use a clearly labeled, non-transactional concept test for recurring household coordination after the free planner succeeds. Compare free export against optional coordination mockups. | Separate clicks, stated value, repeated use and actual purchase. Actual payment or enrollment requires a future authorized test and comes after validated repeat need. | Stop if the paid concept weakens free first-use completion or requires unnecessary personal data. Do not count interest as revenue. |

These are test designs and thresholds, not measured results. Keep the first plan and core break actions free. Defer pricing changes, native apps, new country or travel coverage, and paid household coordination until repeated usage and infrastructure or data quality justify the work. This release authorizes synthetic QA only, with no outreach, enrollment or charges.
