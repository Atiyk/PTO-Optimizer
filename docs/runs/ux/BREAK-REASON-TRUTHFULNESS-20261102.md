# Deterministic break explanation: truthfulness fix

Scope: consumer `src/ui/breakReason.ts` and unit tests only. No solver, policy, B2B, or expansion changes.

## Defect and change

The fallback for low-value (<=1x) breaks asserted that the recommendation deliberately spent the full available budget instead of leaving PTO unspent. The `Break` record does not contain a remaining-budget field or a causal explanation of solver intent, so this assertion was unsupported. Replace it with the actual, already-computed PTO cost and total calendar days off. Keep the existing low-demand explanation when the corresponding tag exists, and retain the holiday/demand priority rules for higher-value breaks.

## Regression

Add a unit case for a 0.5x break using 2 PTO days for 1 day off. Check the explanation uses those facts and does not invent budget intent. Update the original 1x fallback expectation.

## Release gates

Draft-only until exact-head consumer test/typecheck/lint/build, real 1440/768/375/320 screenshots and browser accessibility/SEO checks, independent tester/critic approval, and an exact-head consumer Vercel READY preview are available. This focused text change should be checked in the existing consumer browser evidence workflow; do not claim those checks passed before they finish.

**Owner's single-release policy:** Do not merge to main if that triggers automatic production deployments. Queue this with the other approved UX PRs for one coordinated production release after all UX deliverables pass; verify READY at the final production SHA. Expansion PRs remain gated.

## Follow-up implementation and QA (2026-11-03 UTC)

The low-demand low-value branch still claimed the solver *chose* dates for their travel demand, which the tag alone cannot prove. Revised it to state the factual PTO cost and that the dates are tagged lower-demand, without attributing a solver motive. Added a regression expectation rejecting motive wording. Exact-head CI must be rerun on `3e493d2d763a7538d46fed3d2c4f6b9a91d3484f`; previous green checks apply only to the older head. Independent critic review and 1440/768/375/320 browser evidence remain required. A consumer preview READY for an older head does not establish this head's readiness. Hold PR draft/unmerged for the owner's consolidated production release.

## Mixed estimated-demand tags (2026-11-03 UTC)

The `Estimated` tag must take precedence over `Low travel demand` and `Peak travel` when both are present. Previously a measured-sounding quiet/peak percentage was shown despite the estimate flag. The explanation now uses the existing explicit country-estimate caveat and factual PTO exchange. Regression tests cover both tag combinations. This is consumer-only copy logic; solver and B2B remain unchanged.

Latest implementation/test head before this note: `fed54ebf188aabe772dcfdde217366fd470cbc05`. All exact-head CI, four-width browser evidence, independent critic review, and matching Vercel READY preview must be rechecked after this documentation commit. Keep PR #104 draft and unmerged. Coordinate a single production release after the complete UX stack is approved; do not trigger per-PR main deployments.
