# Gapless parallel engineering — coordination status

**Owner authorization:** 2026-11-06 (no routine check-ins). **State:** STARTED — ENGINEERING INTEGRATION BRANCH CREATED; ALL FEATURES UNRELEASED.
**Integration branch:** gapless/eng-release-20261106
**Main baseline:** 1e48a0c926a87b1ca28763ebf3208f43f72e0443
**Production at baseline:** Vercel READY at same SHA (not evidence of green CI).
**CI blocker:** GitHub consumer validation on current main failed: https://github.com/Atiyk/PTO-Optimizer/actions/runs/42294242927 . Job step/log details were inaccessible on initial connector read. Last green observed: https://github.com/Atiyk/PTO-Optimizer/actions/runs/42063828012 .
**UX ownership:** Claude — no visual design or layout work in this release.
**Scope:** CI/bugs; multi-bank wallet/timeline; calendar-aware couples/families/rotating schedules; hard/soft constraint recommendations; corrected source-aware travel methodology.
**Source of truth:** docs/GAPLESS-ENGINEERING-PARALLEL-MULTIAGENT-20261106.md

## Agent workstreams — current state
| Agent | Branch | PR | State | Gate |
| --- | --- | --- | --- | --- |
| O / orchestrator | gapless/eng-release-20261106 | pending | directive staged | Own integration, cross-module contract |
| B / bugfix + release | gapless/eng-bugfix-20261106 | pending | queued | Diagnose red main CI first |
| W / leave wallet | gapless/eng-wallet-20261106 | pending | queued | Model and migration tests |
| C / calendar/family | gapless/eng-calendar-20261106 | pending | queued | Rotating schedule + hard/soft date availability |
| S / solver/travel | gapless/eng-recommendations-20261106 | pending | queued | Travel source truth + frozen fixtures |
| Q / independent critic | read-only reviewers / own notes | pending | queued | Blocks merge on red CI or correctness |

## Initial cross-agent contracts
- LeaveBank / WalletEvent: explicit bank ID and leave category; existing single-policy computation remains canonical.
- DateAvailability: normalized ISO date and source, hard-block/review-needed/context-only, partial-data flag.
- ConstraintSet: hard exclusion vs soft preference; do not treat school closure as a conflict.
- RecommendationSet: actual non-overlapping dates, PTO cost, feasibility, objective and explanation; duplicate plans must be omitted.
- TravelEvidence: original geographic/year source, historical/heuristic/unsupported label, no airfare price claim.
- All event and calendar inputs bounded and validated, private by default.
- Changes to overlapping existing files require orchestrator approval; no B2B files.

## Merge and release gates
- All worker PRs target integration branch, remain draft until tests and critic.
- CI repair first. Final integration PR to main only after exact-SHA CI, independent critic GO, source/business-logic validation and no visual collisions with Claude.
- Production must report READY on final merged SHA; no claim made yet.
- Prefer one consolidated consumer production deployment; avoid Vercel quota exhaustion.
- Update this document with actual new PRs, exact commits, test runs, blockers and proof rather than placeholders.

## Logs
- 2026-11-06: User approved all four workstreams. Created integration branch and parallel agent directive. Main Vercel READY, consumer CI red; no new feature changes shipped yet.
