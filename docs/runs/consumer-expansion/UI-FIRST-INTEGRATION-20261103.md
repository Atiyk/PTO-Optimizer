# Consumer UI-first polish, single consolidated release candidate

Owner's order on November 3, 2026: finish the **remaining visual/interaction work first in one UI-only PR**, and do **not merge it until all automated checks, four-viewport browser screenshots, genuine independent critic opinion and bug fixes pass**. Only then coordinate a single UI production release and resume the other expansion features.

This *initial batch* updates the current UX main without duplicating already-merged PR #106. All modifications are visual, semantic, and control affordances—**no new policy, payout, carryover, school, calendar or solver functionality**.

- A calmer evergreen-teal action/selection/focus scheme replaces the dominant burnt-orange accent across shared CSS tokens. Text contrast and calendar grayscale semantics stay covered by exact CSS-parsing regression tests. Existing Figtree, warm neutral surfaces and semantic classes remain.
- The homepage now exposes a **visible PTO-days slider** next to the exact numeric input, stays live with the same canonical state and URL, allows keyboard arrow changes, displays a numeric value and accessible value text, without adding a form submit.
- Home's existing three tool destinations are grouped under clearer **Value** and **Act** headings, retaining real recommended break first and retaining country-specific planner, forecasts, policy routes and links.
- Added React regression tests for slider/number synchronization, URL round trip, and Value/Act headings.

**Outstanding on this draft:** inspect production-quality 1440/768/375/320 before/after screenshots, tab/focus, mobile touch, performance/Lighthouse/axe, unrelated route and country regressions, independent critic, and fix all observed bugs on the final head. Continue refining this **same UI PR** in coherent batches; do not create small separate UI release PRs and do not merge feature PR #111 first. Keep B2B `apps/teams` and `packages/engine` untouched.

This document is a draft scope ledger, **not** a passed test report or approval.


## UI-first batch B — visible date inputs and universal keyboard navigation

The homepage's planning dates are now exposed in a labelled fieldset, not hidden behind another details dropdown. Both date fields remain controlled by the same validated canonical landing state; the budget slider and number field continue to share one value and URL. On every consumer route (including glossary fallback pages), `main#main-content` has focusable `tabIndex=-1`; `SiteHeader` adds a visually-hidden-until-focus **Skip to main content** control before the logo/nav. The consumer browser script tests at 1440/768/375/320: direct date field visibility, keyboard slider changes/URL parity, Value/Act headings, skip link and main target, with an additional post-interaction screenshot. These are staged changes; a passing run on the future final exact head and independent critic are still required. No new feature logic, local storage, backend or B2B changes.

## 2026-11-03: Browser-evidenced mobile control width regression

**Blocking observed defect at exact head `1885203195bb8bd667ea43c4109c49f021ddac84`:** Consumer validation [41688373201](https://github.com/Atiyk/PTO-Optimizer/actions/runs/41688373201) passed tests, types, lint and build, but failed the four-width responsive browser job. `homeCountryNotCramped=false` at both 375 and 320px. Independent browser screenshots from the preceding UI-only head likewise show country and PTO numeric controls side-by-side on narrow phones even though the source uses `grid-cols-1 sm:grid-cols-2`. A separate evidence-based AI QA review [PR #112](https://github.com/Atiyk/PTO-Optimizer/pull/112) explicitly marked BLOCK; this is not an independent human approval.

**Targeted fix staged:** dedicated `.landing-input-pair` class and scoped <=639px one-column CSS with precedence, explicit country/budget accessible names, render unit regression and *computed* Playwright grid-column + control-width and country-combobox accessible-name checks at 320 and 375. The canonical country value, PTO budget, URL and shared solver remain unchanged. Do not weaken assertions. Re-run all checks on the exact new commit; independent critic must review the new screenshots and report PASS only if confirmed.

Current release scope remains the one consolidated Consumer UI PR; feature PRs, B2B and shared engine untouched. No merge/production release with a red responsive job.
