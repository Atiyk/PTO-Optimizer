# F2 — Connected policy explanation contract (isolated draft)

**Owner:** Consumer expansion Policy/Forecast role (sequential implementation; no independent subagent or critic signoff).  
**Branch:** `gapless/expansion-policy-explainer-20261102`  
**Scope:** `src/personal/policyExplanation.ts` and its tests only. No UX, shared solver, URL, storage, `apps/teams`, or employer/B2B changes.

## Purpose

`explainConnectedPolicy(policy, through, requests)` returns nine deterministic plain-English explanations tied to the existing `TimeOffPolicy` and the exact `forecastWithRequests` event trace. It includes the rule, an example, observed/configured/unprojected impact, and an HR question. All guide links point to the existing `/glossary` route, not a hypothetical destination.

The module does **not** calculate PTO balances itself. It never parses handbooks, interprets laws, guesses jurisdiction-specific entitlements, or exports request IDs/notes. It treats payout as a user-entered employer-policy assumption only.

## Invariants and limitations

1. Every numeric amount comes from `forecastWithRequests`, including accrued credits, scheduled units, forfeiture, carryover, cap losses and unfunded leave. Unit remains days or hours.
2. Approved/completed leave and policy-planned days are deduplicated; tentative requests are separate. Days at or before the balance-as-of date are not deducted again.
3. Carryover and expiration impacts are **observed only within the requested forecast window**. A configured rule is not proof that a reset or expiration has happened.
4. The waiting period is informational in the existing projection; **the engine does not block spending before it ends**. This limitation is explicit in the output.
5. The forecast caps unfunded spending at the configured negative allowance. Scheduled units are not always identical to units deducted; disclose `confirmedUnfunded` and `tentativeUnfunded`.
6. Unlimited PTO has no banked balance or gross payout. Invalid inputs return `null`, not zero.
7. A `pays` or `doesnt` payout setting is not evidence of legal entitlement. The consumer payout module and independently verified official-source legal registry remain separate.
8. This is a **domain/content foundation only**, not a shipped user-facing explainer. No changes to URL semantics, privacy, storage or existing planner rendering.

## Acceptance and release holds

- Focused Vitest cases cover pay dates, cap, reset, expiration, hours, overlap/as-of, borrowing, waiting period, unlimited, payout disclaimers and privacy.
- Require exact-head GitHub Actions consumer tests, TypeScript, lint, build, browser QA, and independent blocking critic before merging.
- Feature-specific 1440/768/375/320 screenshots are **not applicable yet** because this draft adds no UI; all four widths must be validated when connected to the policy page.
- Do not merge until preceding UX scope is independently completed, merged, critic-approved and Vercel production READY on its final SHA.
- Do not claim a Vercel preview or release while the deployment quota is blocking verification.

## Integration handoff

Once the UX agent releases the current UI work, the expansion orchestrator can wire these typed explanations into the existing policy page and QuickForecast as one accessible expandable summary, with instant updates, existing URL round-tripping and 320px layout checks. An independent critic must validate that the copy and trace remain accurate in the real UI.
