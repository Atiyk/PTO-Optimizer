# Consumer expansion integration candidate — 2026-11-03

**Base:** verified UX production main `01a2368c07d43b15404710609ffae567ab2bc462`.

One additive consumer-only candidate combines three disjoint draft implementation PRs, each based on the same UX production SHA:

- [#107](https://github.com/Atiyk/PTO-Optimizer/pull/107), source head `73b4e8f273b5d426d1a370acb77f23d10cbd3247`: on-demand plain-English policy explanations, 1/3/6-month/year-end shortcuts, date-specific comparison domain foundations (supersedes #93/#98/#103).
- [#108](https://github.com/Atiyk/PTO-Optimizer/pull/108), source head `8e8fe5748065fb77961a719ea41659c696fc6e0b`: private, company-policy-only gross departure payout estimator, no law coverage (supersedes #91).
- [#110](https://github.com/Atiyk/PTO-Optimizer/pull/110), source head `91f2f7f97d0bbb6da15e705604db404c5399ff37`: canonical carryover and expiration next-reset display within existing ExpirationGuard (supersedes #94).

All three PR file lists were independently compared and have **zero overlapping paths**. Combined preview and CI must still verify the combined UI at /policy. No B2B `apps/teams/`, shared solver `packages/engine/`, external API, account or backend changes.

## Release gate
- Run exact-head consumer tests, TS/lint/build/prerender and all three dedicated four-width Playwright runs with screenshots, keyboard, focus, privacy, Lighthouse and accessibility on the **combined** candidate.
- Inspect real screenshot artifacts and invalid/boundary cases. An implementer's assessment is not an independent critic; no independent submitted review is currently established.
- Verify preview READY matching exact combined SHA. Do not merge or deploy until branch protection and critic/release gates are genuinely satisfied.
- Employer company-policy payout assumptions do NOT confer legal rights. Mandatory state/country law registry not yet implemented; none verified. Private salary is not saved/shared. Date-specific comparison function does not itself constitute a complete vacation editing screen.
- Remaining unintegrated expansion drafts include #89 (school/conflicts), #96 (employer profiles), and #100 (ICS safety). The full owner-approved expansion program is **not complete**, even if this batch is green. Do not merge the source PRs again once this combined candidate lands.
