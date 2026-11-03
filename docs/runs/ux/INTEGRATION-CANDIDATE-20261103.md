# Consumer UX integration candidate — November 3, 2026

**Staging status: Unreferenced Git commit object only.** Not a branch, PR, merge, Vercel build/preview or production deployment. Owner forbids Vercel activity before Nov 3 at 08:30 America/New_York.

## Sources — exact UX branch heads
- PR #87: `7665b1d5c013dde8a01f4e35fc8b87a7cc50eabf`
- PR #88: `f7bff93efaa7f45e289669ee77c26e5ae5c0f762`
- PR #90: `c48be095cf940216fc473fd5af49d038df13ae34`
- PR #92: `20d16209c4a223aa78d94806553de6f9d49677d3`
- PR #95: `45101bbcddea0203767fda9f0079030de1ddb6cd`
- PR #97: `c074a47c5601e8a76df9c7d9e092666e67e0ac69`
- PR #99: `571fda802d4f47b2ce510369506470b041f972ba`
- PR #101: `064d4d7a8f950f7b4988bc0f07545749e03b511b`
- PR #102: `27c79d2c4495e700f6f78305ab9c814cf7ca57f8`
- PR #104: `2183010191648122948ac2237663e07659e986c4`

The tree integrates ten consumer-only UX drafts onto main baseline `3187596230768e4818720d1907475c9a3341a54c`. It excludes all Consumer Expansion PRs and never changes `apps/teams` or `packages/engine`. Each individual PR QA note is retained; avoid overwriting conflicted `docs/runs/ux/STATUS.md` from four branches.

## Manual reconciliations
- `src/ui/App.tsx`: includes both the optional deterministic Why this plan section (#87) and the recoverable infeasible-pinned-calendar UX (#92).
- `scripts/consumer-qa.mjs`: integrates explanation (#87), homepage result-first (#88) and immediate Understand glossary search (#95) with **all** combined pass/fail predicates.
- `.github/workflows/consumer-validation.yml`: combines calendar touch (#90), header keyboard (#97) and date editor (#101) browser evidence commands.
- `docs/runs/ux/STATUS.md` stays at main; this document is the integration inventory.

## Quality and release gates
- GitHub Consumer validation completed `success` at exact heads of #87, #88, #90, #92, #95, #97, #99, #101, #102. Dedicated FAQ Chromium evidence passed at #102's head. These are isolated PR results, **not integrated-branch results**.
- Latest #104 head was corrected to `2183010191648122948ac2237663e07659e986c4` for prior TypeScript test failure. Verify its exact-head CI, do not assume passing.
- This integrated tree is **NOT yet built, tested, visually inspected, or independently reviewed**. After Vercel hold ends, establish a single candidate branch only if this cannot trigger prohibited Vercel activity, run full npm test/typecheck/lint/build and real Chromium QA at 1440/768/375/320 including accessibility, SEO, overflow, keyboard, date editing and solver recovery; inspect screenshots and fix any failing checks.
- Independent critic signoff and exact-head consumer `pto-optimizer` Vercel READY preview remain gating. Do not count self-review as independent, or B2B `leave_management` as consumer.
- Do not merge individual drafts if main pushes trigger intermediate production builds; coordinate one safe approved UX production release after 08:30 ET, verify READY at exact final main SHA.
- If UX implementation and QA finish before 08:30, disable first agent after durable handoff; second may begin exclusively but preserve UX release priority.
