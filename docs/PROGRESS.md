# Gapless Consumer UX — Progress and Release Queue

**Last checked:** 2026-11-02, 15:42 ET.  
**Scope:** Consumer root Vite app. Do not modify `apps/teams` or employer/B2B product.  
**Release policy:** PRs remain draft until exact-head tests, browser/visual evidence, independent critic signoff, Vercel READY preview and standard GitHub checks pass. Verify production READY at the merged main SHA before declaring a release shipped.

## Production baseline

- Main and production Vercel were both verified at `3187596230768e4818720d1907475c9a3341a54c` (PR #86).
- Shipped: #83 visible sliders/Understand navigation, #85 substantive guides, #86 responsive planner controls.
- #82 is an old duplicate, closed without merge.

## UX PRs pending coordinated release

| PR | Workstream | Exact head | CI evidence | Release gate |
| --- | --- | --- | --- | --- |
| [#87](https://github.com/Atiyk/PTO-Optimizer/pull/87) | Deterministic plan explanation | `7665b1d5` | Green on exact head | Preview + critic |
| [#88](https://github.com/Atiyk/PTO-Optimizer/pull/88) | Result-first homepage | `f7bff93e` | Recheck exact head before merge | Preview + critic |
| [#90](https://github.com/Atiyk/PTO-Optimizer/pull/90) | Touch-only calendar actions | `c48be095` | Green on exact head | Preview + critic |
| [#92](https://github.com/Atiyk/PTO-Optimizer/pull/92) | Recoverable calendar constraints | `20d16209` | Green [run 41513876073](https://github.com/Atiyk/PTO-Optimizer/actions/runs/41513876073) | Preview + critic; reconcile #87/#90 |
| [#95](https://github.com/Atiyk/PTO-Optimizer/pull/95) | Search-first Understand glossary | `836b63d8` at PR creation | Exact-head CI triggered; do not infer pass | Preview + critic; reconcile shared browser QA script |

**Do not merge a stack of individually green branches blindly.** #87 and #92 both edit `src/ui/App.tsx`; #90 changes calendar interaction semantics; #87, #88 and #95 touch `scripts/consumer-qa.mjs`. Integrate sequentially from fresh main, resolve overlapping files, rerun tests and visual evidence on each integrated head, then verify production.

## Current implementation: search-first Understand

PR #95 fixes a real discoverability issue: the glossary search was below four learning pathways, six guides and a CTA; typing updated terms below those sections. Search is now near the top, matching terms appear immediately, a polite live count is announced, and a clear action restores the default learning paths and keyboard focus. A new test file and browser interactions cover empty results, whitespace, 1440/768/375/320 layouts and horizontal overflow. Full detail: `docs/runs/ux/UNDERSTAND-SEARCH-20261102.md`.

## Active blockers and next actions

1. Vercel's daily deployment limit has rejected newer previews. Continue coding and GitHub CI, but do not merge until exact-head previews and critic review are available.
2. Review #95 exact-head CI, including the 320px search interactions and screenshots. Fix any failures in its own branch and update this file.
3. Critic review #87/#88/#90/#92/#95 independently; check both visible sliders, accessible mobile calendar recovery, stable URLs, no private data leakage, semantic content and no B2B changes.
4. Rebase/integrate focused PRs sequentially with fresh CI, browser evidence and Vercel preview. Confirm READY production on the exact merge SHA.
5. Do not release the separate expansion implementation until UX completion is explicit and production-verified. Expansion draft PRs #89, #91, #93, #94 exist but must not be merged into this UX release; keep ownership separate.
6. Only disable the recurring UX implementation task when the full owner-approved UX scope is merged and live, not after one green PR or one successful scheduled run.

**Status:** UX scope remains unfinished; no new merge or production deployment is claimed in this workstream.
