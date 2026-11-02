# Gapless consumer UX — autonomous run status

Last updated: 2026-11-02. Scope: consumer root Vite application only; never `apps/teams`.

## Shipped and verified

- PR [#83](https://github.com/Atiyk/PTO-Optimizer/pull/83) merged as `e294fc5c408cf480fd87daf5fcdd40b2f74a7b31`. It restores both visible planner sliders, adds four curated Understand pathways and optional agent navigation guidance. Latest commit's consumer tests/typecheck/lint/build and browser/visual evidence checks passed.
- Production `https://pto-optimizer-seven.vercel.app/` was observed READY on **exactly** `e294fc5c408cf480fd87daf5fcdd40b2f74a7b31` after merge. Duplicate PR #82 was closed without merging.

## Newly shipped and verified

- PR [#85](https://github.com/Atiyk/PTO-Optimizer/pull/85) merged to main as `a05d6af2bd334becb6a0ba7c748813927c29df5b`: eight substantive, jurisdiction-neutral guides with examples, HR questions and tool links on existing prerendered glossary routes. Consumer tests/types/lint/build and browser/visual evidence passed on head `99f0345b827d2b0a9cb8fde8ac2e1936810674bd`; 20.9 MB screenshot artifact available. Vercel production READY was verified on exact merge SHA `a05d6af2bd334becb6a0ba7c748813927c29df5b` on 2026-11-02.

## Current work — not yet merged or deployed

- Branch `gapless/ux-planner-responsive-controls-20261102`: replace cramped single-row primary controls with distinct "Your time off" and "Shape your plan" sections, while retaining BOTH always-visible sliders and live calculation. Make native date inputs shrink within a responsive grid at 320px. Expand Playwright browser QA to exercise 320px planner, slider visibility, keyboard responsiveness and options disclosure overflow.
- **Merge gate:** open a focused PR; verify exact-head GitHub tests/typecheck/lint/build and browser/visual screenshots at 1440/768/375/320, Vercel preview READY, scope and critic review. Do not merge if any check fails or the visual hierarchy regresses.

## Remaining approved UX scope after this PR

1. Refine desktop/mobile planner hierarchy, input density, top opportunities and calendar readability, without hiding the two sliders or adding a Generate step.
2. Improve homepage and mobile affordances after real 1440/768/375/320 browser evidence; preserve free-form dates, live calculation and URL round-tripping.
3. Confirm deeper guide quality and useful policy cross-links; avoid generic SEO pages.
4. Improve semantic and agent-readable content only where there is a genuine discoverability gap. Optional `llms.txt` is not an AI-indexing guarantee.
5. Evaluate a deterministic, sourced "Why this plan?" explanation. Existing `src/ui/breakReason.ts` already produces grounded per-break reasons; avoid duplicating or hallucinating math.
6. Independent QA/critic gate and production READY verification at every merge SHA. Full UX work is **not complete**.

## Known platform constraints

This scheduled run can edit GitHub files through the connector, but this sandbox cannot clone GitHub over the network. Use GitHub Actions for full npm tests, production builds and real browser evidence. Never claim local execution or an unobserved reviewer approval. Keep draft PRs unmerged until quality gates pass. Work in focused feature branches; do not touch the B2B subtree.

## Draft implementation: calendar recovery for infeasible pinned PTO (PR #92)

- PR [#92](https://github.com/Atiyk/PTO-Optimizer/pull/92) on `gapless/ux-recover-calendar-after-constraint-20261102` fixes a specific UX trap: a solver issue (for example, a pinned working day with zero available PTO) previously removed the entire interactive calendar, leaving no way to unpin that date. The calendar now remains visible for **valid date inputs** even when no valid plan can be solved; export remains suppressed.
- A separate accessible warning explains the real solver issue, offers **Clear pinned and excluded dates** without changing the budget, dates or employer policy, and opens advanced constraints. Component tests and a real 320px browser-journey fixture cover the recovery path.
- **Not shipped:** exact-head CI/browser evidence, independent critic signoff, and Vercel preview are still required. Vercel reports a temporary deployment rate limit; no quota bypass, no merge and no production deployment are claimed. Reconcile `App.tsx` with PR #87 before merging.

## 2026-11-02 UX release queue and CI triage

- **Verified production baseline:** main at `3187596230768e4818720d1907475c9a3341a54c`, Vercel consumer production READY. PRs #83, #85 and #86 are merged; old PR #82 was closed, not merged.
- **PR #87** (deterministic "Why this plan?") passed exact-head consumer test/build and browser evidence at `7665b1d5c013dde8a01f4e35fc8b87a7cc50eabf`. It remains draft due to missing Vercel preview and independent critic signoff.
- **PR #88** (result-first homepage) is a separate draft and touches landing UX and browser evidence; re-check its exact-head CI before integration.
- **PR #90** (touch-only calendar day actions) passed complete exact-head consumer and browser validation at `c48be095cf940216fc473fd5af49d038df13ae34`. It remains draft due to missing Vercel preview and independent critic signoff.
- **PR #92** (calendar recovery on solver constraint) initially failed [CI run 41503805897](https://github.com/Atiyk/PTO-Optimizer/actions/runs/41503805897) for two concrete reasons: an integration test asserted the old disappearing-calendar behavior; and the browser fixture pinned **January 18, 2027**, Martin Luther King Jr. Day (a US holiday requiring zero PTO), rather than an unfunded working day. Corrected the assertion to expect the recovery alert and editable calendar, and pinned **January 19, 2027** in the browser regression. Current branch includes these fixes; **fresh exact-head CI must pass before review or merge**. PR #92 remains draft.
- **Merge order:** reconcile overlapping `App.tsx` edits from #87 and #92; coordinate calendar touch affordances in #90 before claiming mobile unpin works. Do not force-merge or cherry-pick without full tests on the integrated head.
- **External gate:** Vercel free daily deployment quota has rejected recent preview attempts. Continue source changes, isolated CI and independent reviews; **do not** merge drafts requiring exact-head preview until Vercel READY and critic approval are observed.
- **Cross-workstream coordination:** expansion PRs #89 and #91 are draft, not merged. Do not integrate expansion code or B2B code as part of the UX release; the expansion handoff remains gated on completed, production-verified UX scope.
