# Gapless parallel engineering — coordination status

**Owner authorization:** 2026-11-06 (no routine check-ins). **State:** BUILDING — THREE DOMAIN DRAFT PRS OPEN; ALL FEATURES UNRELEASED; CI BLOCKED BEFORE RUNNER ALLOCATION.
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
| O / orchestrator | gapless/eng-release-20261106 | [#125](https://github.com/Atiyk/PTO-Optimizer/pull/125) | draft integration, owner active | Own integration, cross-module contract |
| B / bugfix + release | gapless/eng-bugfix-20261106 | [issue #127](https://github.com/Atiyk/PTO-Optimizer/issues/127) | runner fail pre-steps, root cause unverified | Obtain annotation/runner account evidence |
| W / leave wallet | gapless/eng-wallet-20261106 | [#126](https://github.com/Atiyk/PTO-Optimizer/pull/126) | drafted pure multi-bank adapter and unit tests | Migrations, codec and CI/critic |
| C / calendar/family | gapless/eng-calendar-20261106 | [#128](https://github.com/Atiyk/PTO-Optimizer/pull/128) | draft pure cycle + joint availability with tests | Integrate with family/conflicts, CI/critic |
| S / solver/travel | gapless/eng-recommendations-20261106 | [#129](https://github.com/Atiyk/PTO-Optimizer/pull/129) | source-labeled seasonal data adapter; solver unchanged | Feasible recommendation variants, benchmarks, CI/critic |
| Q / independent critic | read-only reviewer / own notes | pending | scheduled for independent pass | Blocks merge on red CI or correctness |

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

## Automation IDs and execution model
- B bugfix: 6aee6481eabc8191bce188c2399a7734 — hourly, enabled.
- W wallet: 6aee648287e88191bf922a30960ecab2 — hourly, enabled.
- C + S specialized calendar and recommendation roles share one scheduled worker: 6aee6483397c8191a49283acf980c565 — hourly, enabled (separate source branches and PRs).
- Q independent critic: 6aee6484af408191b494a1e9b53b22e1 — hourly, enabled.
- O orchestrator/integration: 6aee64a80ec8819185efedee1f921d4a — hourly, enabled.
- Extra standalone S task 6aee6483e8e48191bd43679d0e84c7ba is disabled to respect the platform's five-active-task limit.
- Explicit immediate invocations returned inline to this conversation; code PRs #126/#128/#129 and issue #127 were created in this execution. Future schedules run hourly, subject to execution/tool limits; no claim of uninterrupted background computer processes.

## CI triage evidence
Run 42294242927 lasted approximately two seconds in both jobs: GitHub Actions job objects have runner_id=0, blank runner_name, zero executed steps, and two annotations each. This suggests the failure occurred before runner assignment rather than during npm tests; job-log redirect returned BlobNotFound. The underlying provider/account root cause remains unverified. DO NOT treat these as passing tests, nor disable CI to get a green badge.

## Release rules
The new travelEvidence adapter is opt-in/not connected to the shared solver and has not changed live travel scoring. The leaveWallet and recurringAvailability modules are domain-only; there is not yet a complete new user-facing wallet or calendar experience. All three PRs remain draft. No new consumer deployment from this engineering workflow. Claude retains UI/UX ownership.
