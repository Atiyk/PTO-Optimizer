# Deterministic break explanation: truthfulness fix

Scope: consumer `src/ui/breakReason.ts` and unit tests only. No solver, policy, B2B, or expansion changes.

## Defect and change

The fallback for low-value (<=1x) breaks asserted that the recommendation deliberately spent the full available budget instead of leaving PTO unspent. The `Break` record does not contain a remaining-budget field or a causal explanation of solver intent, so this assertion was unsupported. Replace it with the actual, already-computed PTO cost and total calendar days off. Keep the existing low-demand explanation when the corresponding tag exists, and retain the holiday/demand priority rules for higher-value breaks.

## Regression

Add a unit case for a 0.5x break using 2 PTO days for 1 day off. Check the explanation uses those facts and does not invent budget intent. Update the original 1x fallback expectation.

## Release gates

Draft-only until exact-head consumer test/typecheck/lint/build, real 1440/768/375/320 screenshots and browser accessibility/SEO checks, independent tester/critic approval, and an exact-head consumer Vercel READY preview are available. This focused text change should be checked in the existing consumer browser evidence workflow; do not claim those checks passed before they finish.

**Owner's single-release policy:** Do not merge to main if that triggers automatic production deployments. Queue this with the other approved UX PRs for one coordinated production release after all UX deliverables pass; verify READY at the final production SHA. Expansion PRs remain gated.
