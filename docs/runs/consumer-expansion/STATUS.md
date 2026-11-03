# Consumer expansion — handoff and release ledger

Updated: 2026-11-03 09:42 ET

## Ownership gate
- Prior UX automation `6ae888a6a99c819180777bbd6ec10377`: **disabled**, verified via automation listing this run.
- UX consolidation: PR #106, merged main SHA `01a2368c07d43b15404710609ffae567ab2bc462` (owner-provided release record).
- UX validation: consumer workflow `41646736993`, FAQ workflow `41646737034`, both SUCCESS on combined-source SHA `d26ad0129722a3144a122776d29b11e6d0a7fd33` (owner-provided).
- UX production: `dpl_4r1hK6VUPjSu7CpuZGsTxPduziQ7`, READY at exact merged main SHA above (owner-provided; see issue #105 comment 6606370988).
- Independent GitHub critic reviews of UX: **none submitted**; do not claim otherwise.
- Consumer expansion agent now sole code owner. No changes to `apps/teams` or shared solver.

## Architecture contract / implementation order
1. Inspect and reuse `src/policy`, `src/personal`, QuickForecast, ExpirationGuard, employerCalendar and versioned URL codecs. Maintain existing calculation engine and separation of public/shareable vs private state.
2. Implement payout as an explicitly labeled **employer-policy scenario** first; unknown law stays unknown until effective-dated official jurisdiction sources are verified. No blanket state/country coverage, no gross-to-net implication.
3. Extend the existing forecast/expiration trace for arbitrary dates, ledger deduplication, carryover and cap effects; keep policy and forecast on one pure engine.
4. Build local employer/school/ICS calendars and conflict detector using shared date normalization, privacy-preserving parsing and bounded imports.
5. Connect Understand guides, country pages, responsive accessibility and deterministic explanations. Keep signed-out parity and existing solver/URLs.
6. Integrate expansion PRs separately from completed UX release. Do not merge unreviewed or failing work; minimize production deployments.

## QA gates
- `npx vitest run`, `npx tsc --noEmit`, lint and `npm run build` at integrated head.
- Real Chromium screenshots/interaction at 1440/768/375/320, keyboard/touch, axe, SEO/URL round trip, privacy and B2B isolation.
- Independent critic review must be genuinely independent, not self-certified.
- Only claim release when Vercel production is READY on the exact final expansion main SHA.

## Current status
**building / handoff recorded**. This branch is a durable coordination note, not a shipped expansion feature. No expansion merge or production deployment is claimed.

## 2026-11-03 — manual owner-authorized substantial expansion implementation

Unlike the historical handoff-only text above, implementation **has now started** under exclusive agent 2 ownership, after live verification that UX PR #106 production is READY at `01a2368c07d43b15404710609ffae567ab2bc462` and predecessor UX automation is disabled. This supersedes any prior assumption that expansion development was still waiting.

### Isolated integration PRs
- [PR #107](https://github.com/Atiyk/PTO-Optimizer/pull/107) (`gapless/expansion-a2-integrated-20261103`), exact head `73b4e8f273b5d426d1a370acb77f23d10cbd3247`: canonical PTO forecast shortcuts, on-demand policy explanation, pure vacation what-if comparison. Supersedes existing draft code #93/#98/#103. Dedicated 1440/768/375/320 QA run `41656661937` **SUCCESS**; exact-head consumer validation `41656661311` was in progress on last review. Exact-head preview READY.
- [PR #108](https://github.com/Atiyk/PTO-Optimizer/pull/108) (`gapless/expansion-payout-ui-20261103`), exact head `8e8fe5748065fb77961a719ea41659c696fc6e0b`: local-only gross employer-policy payout scenario UI using canonical source #91, four new UI tests and 1440/768/375/320 privacy/interactions QA run `41656290656` **SUCCESS**. Standard consumer validation `41656290706` was in progress at prior check; exact-head preview READY. No mandatory law coverage claimed.
- [PR #110](https://github.com/Atiyk/PTO-Optimizer/pull/110) (`gapless/expansion-carryover-guard-20261103`), exact head `91f2f7f97d0bbb6da15e705604db404c5399ff37`: canonical carryover snapshot #94 integrated with existing expiration guard, 12 domain regression tests, two UI regressions, four-viewport Playwright screenshots. Exact-head dedicated `41657411489` **SUCCESS**; general consumer validation `41657411667` in progress at last check; exact-head preview READY. No duplicate alert/solver system.

### Whole-candidate cross-feature QA
- [PR #111](https://github.com/Atiyk/PTO-Optimizer/pull/111), branch `gapless/expansion-abc-combined-20261103`, **exact integration candidate `24cf7f5369b898a072c7ffc827bb51222594e5ff`**. Contains the exact last-head blobs from #107, #108 and #110, 31 source paths plus one integration contract; **zero overlapping changed paths and no `apps/teams` or `packages/engine` edits**. All three features appear on /policy; combined tests/browser QA run at the combined SHA. Actions `41658215123` consumer validation; `41658215166` forecast; `41658214962` payout; `41658215116` carryover all started; none yet verified complete on integration head. Combined preview `dpl_BY4H6Yc6kXgNdi1dGgJ4WhFq5upr` BUILDING at last check. This is **draft**, not approved or merged.
- Source PRs #91, #93, #94, #98, #103 must not be merged separately after integration; #107/#108/#110 also stay draft if #111 ultimately lands. This avoids duplicate implementation and repeated production deployments.
- Remaining expansion workstreams #89 school/conflicts, #96 employer profile, #100 ICS import and official-law registry/country coverage are incomplete; owner-approved full expansion **not done**.
- Critic: **no genuinely independent reviewer signoff confirmed** on new integration. No expansion production merges or deploys. User instructed immediate development and merging when fully finished, not bypass of required QA.

**Important branch coordination:** The historical directive draft PR #84 ALSO modifies this STATUS.md file on its old branch. Treat this up-to-date #109 branch as the coordination log; reconcile before any eventual merge of #84, and do not silently overwrite this history.

### Combined exact-head failure and repair — 2026-11-03

- Running real GitHub CI exposed a red test in carryover source PR #110 [run 41657411667](https://github.com/Atiyk/PTO-Optimizer/actions/runs/41657411667) and combined #111 [run 41658215123](https://github.com/Atiyk/PTO-Optimizer/actions/runs/41658215123): `src/ui/ExpirationGuard.test.tsx` used `getByText('5 days')` and matched **two correct rendered values** (both the carried balance and after-reset balance were 5), so the test assumption of unique numeric text was wrong. Real browser four-width tests passed. Corrected tests to assert the numeric value next to its explicit semantic label in **both** source and combined branches, not by globally unique text.
- PR #110 head after fix: `865e812c23bdccb34385f9c5b2878c6f94d89e08` (source #110 only).
- Combined PR #111 added a four-viewport **cross-feature /policy browser journey** in `scripts/consumer-expansion-journey.mjs` and dedicated GitHub workflow: tests forecast shortcuts + on-demand policy explanation + next-reset disclosure + gross payout + privacy of pay/work location + state preservation in the **same page**, across 1440,768,375,320. Initial integrated journey commit `41368f40f045747ddcd42c5fc08942539b62aae6`, then fixed red unit-test assertion. **Combined current head `4112f7c012562d33c303c87879dcb2b740a800d1`**. All exact-head checks must rerun on this newer SHA; no previous CI results count as approvals. Do not merge until full successful combined CI, visual inspection and genuine independent critic.
- The red unit test had **not** established a functional carryover arithmetic defect: the identical 5-day figures appear in different, semantically labeled result fields. Still verify other branch and cross-feature interactions rather than assuming green.

## 2026-11-03 — OWNER SUPERSEDING RELEASE ORDER: UI FIRST

**Status:** `UI_FIRST_BLOCKING_OTHERS` — Owner instructed finishing **remaining consumer-facing UI work first as ONE consolidated UI-only PR**, reviewed, tested, bug-fixed and then merged/released once. The original consumer UX release #106 is already production READY at `01a2368c07d43b15404710609ffae567ab2bc462`; do not relaunch the completed UX project. This next UI-only phase is the polish/refinement still remaining in the expansion roadmap, without bundling unfinished payout/forecast/carryover/school/employer feature logic in that first UI PR.

### Absolute sequence and acceptance

1. First create or continue exactly ONE *new* UI-only integration branch and PR from fresh main for remaining homepage, controls/sliders, navigation, Value/Act/Understand information architecture, mobile usability, visual consistency and accessibility. Read the existing UX merged state and design directive before coding; avoid duplicating shipped changes. Keep B2B `apps/teams` and shared solver untouched.
2. On its complete *exact* integration head, run tests, typecheck, lint, production build/prerender, real Chromium screenshots/interaction at 1440/768/375/320, keyboard/touch/focus, axe, Lighthouse, URL/country regressions, privacy review. An **independent** (not implementing agent's self-review) blocking critic must explicitly give an opinion; fix **every confirmed bug** and rerun all affected checks. No "green" claim until latest exact-head evidence is verified.
3. Only after these gates **all pass**, do ONE normal protected merge of the full UI PR and verify ONE Vercel production READY deployment at exactly its merged main SHA. The existence of a Vercel preview READY does not permit a production merge by itself. If independent critic tool/reviewer cannot be secured, keep draft and record the blocker—never forge signoff.
4. Only **after** UI production is verified start merging the other feature releases in order: forecast/policy, departure payout with official-law verification, carryover, employer/school calendar/ICS/conflicts, countries/Understand, accessibility and approved AI/agent ideas. For **each new feature/part**, all of the same checks, independent critic opinion, confirmed bug fixes and exact-head QA are strict preconditions to merge and production deployment.
5. Existing feature PRs [#107](https://github.com/Atiyk/PTO-Optimizer/pull/107) [#108](https://github.com/Atiyk/PTO-Optimizer/pull/108) [#110](https://github.com/Atiyk/PTO-Optimizer/pull/110) and combined [#111](https://github.com/Atiyk/PTO-Optimizer/pull/111) **remain draft/QUEUED**, never the UI-only first release. #111 PR title/body was explicitly marked HOLD until after UI; no source feature PR gets an intermediate production merge. Prior isolated checks can inform quality but do not override this gate. Some checks may have been completed for prior SHAs; the new review and release must use the **actual latest head**.
6. The hourly expansion automation was updated to this superseding instruction, with unchanged cadence. No completed feature/production release is claimed by this status note.


### Cross-feature browser journey QA correction — November 3

- The first combined Playwright journey run [41658996679](https://github.com/Atiyk/PTO-Optimizer/actions/runs/41658996679) **failed** at all four viewport widths solely on the assertion `forecastLive`: it clicked the **3-month** preset even though /policy's default selected forecast could already be that same date. Log evidence showed every other check **true** at all widths: three UI sections present, deterministic policy explanation and legal caveat visible, carryover panel visible, unknown-by-default payout, gross result, private pay/location kept off URL, salary state preserved after switching forecast, zero horizontal overflow, no runtime errors.
- Adjusted synthetic journey to select the **1-month** preset (matching the existing dedicated working forecast QA), which ensures a changed live date. Latest **combined PR #111 head `39f7f1ff4f62ccedc1574ca306fd3993478f89c6`**; dedicated 4-width combined run [41659457683](https://github.com/Atiyk/PTO-Optimizer/actions/runs/41659457683) and general combined run [41659457576](https://github.com/Atiyk/PTO-Optimizer/actions/runs/41659457576) are queued/running. Old failure does **not** indicate a solver bug, but the new exact head must be verified before merge.
- Carryover source PR #110 corrected head `865e812c23bdccb34385f9c5b2878c6f94d89e08`, its dedicated QA run [41658999076](https://github.com/Atiyk/PTO-Optimizer/actions/runs/41658999076) **SUCCESS**, latest general validation [41658999064](https://github.com/Atiyk/PTO-Optimizer/actions/runs/41658999064) in progress. Vercel preview READY at this source head; no production merge.

### UI-only release draft now opened — PR #112 (2026-11-03)

- Created **[PR #112](https://github.com/Atiyk/PTO-Optimizer/pull/112)**, the ONE new consolidated UI-first release candidate, branch `gapless/consumer-ui-first-integration-20261103`, initial head `ab7f527a51126e3af2244b14e37c7d0a55699fa7`. Built directly from verified UX production main `01a2368c07d43b15404710609ffae567ab2bc462`.
- Initial UI-only files `src/index.css`, `src/ui/scoreFormat.ts`, `src/ui/colorScheme.ts`, `src/ui/Landing.tsx`, `src/ui/Landing.test.tsx`, `src/ui/tokens.test.ts` and this candidate's docs: calmer evergreen-teal action and PTO palette; visible interactive home PTO-days range slider synchronized with numeric field and existing canonical URL; clearer Value/Act semantic grouping; accessibility/contrast regression. Does not add or merge any new forecast/payout/carryover domain feature; zero B2B/shared engine files.
- GitHub `Consumer validation` run [41659720229](https://github.com/Atiyk/PTO-Optimizer/actions/runs/41659720229) was **IN PROGRESS** at the first exact-head check. Zero submitted GitHub reviews found on PR #112. **No independent critic approval, no production deployment**; PR remains draft. Any automated Vercel preview is non-production and no indication of critic signoff.
- Continue improving UX **on PR #112** and collect/inspect actual before-after 1440/768/375/320 screenshot artifacts, keyboard/touch/slider, accessible navigation, URL/country/SEO and all latest-head CI before considering merge. Fix every reproducible defect, rerun and obtain real independent critic opinion. Only then one consolidated main merge and exact production READY verification. PR #111 remains explicitly HOLD for later feature phase.
