# Consumer carryover snapshot — isolated F6 foundation

Owner: expansion policy/forecast workstream. Scope: **consumer-only pure functions**, no React, storage, routes, B2B, or legal entitlement logic.

- `src/personal/carryoverSnapshot.ts` projects the **next** calendar, custom or anniversary reset using existing `resetDatesInRange` and `forecastWithRequests`. It reads the canonical `PolicyEvent` stream; it does not implement separate accrual, forfeiture, cap or carryover arithmetic.
- Returns native units (days or hours), balance immediately before reset, carried/forfeited portions, grant on reset, after-reset balance, accrued and lost accrual, scheduled leave, any carried portion expiring before reset, and unfunded requests. Tentative and confirmed cases remain separate. Approved/completed and policy-planned days are deduplicated by the existing forecast.
- If a configured carried-bank use-by date is **after this reset and before the following reset**, a second canonical forecast computes the actual projected expiry at that deadline, including leave spent on the deadline itself. Otherwise `deadlineNeedsReview` is true; the helper does not invent a post-reset expiration. Existing carried-bank expiration before the reset remains visible separately.
- Unlimited PTO and invalid policy/ledger dates yield `null`, not invented accrued balances. A missing use-by date is not an expiry claim.
- This is not a new alert engine. `src/personal/expiration.ts` and `src/ui/ExpirationGuard.tsx` remain the source for alerts/reminder ICS and will be integrated later after UX handoff.
- No private request IDs, notes, employer names, salary, or imported calendar content are serialized or returned. No URLs are created by this helper.
- Draft only while UX PRs #87/#88/#90/#92 and Vercel preview quota block Gate 0. Before release: independent critic review, exact-head CI, user-facing integration, real 1440/768/375/320 browser evidence, Vercel READY preview, and final UX handoff are required.

Test matrix: capped/all/none carryover, partial/fractional native units, non-calendar reset, reset-day grant, accrual cap, approved/tentative/overlapping leave, current carried expiry before reset, new carried expiry after reset, out-of-cycle deadline, insufficient balance, unlimited and malformed policy.
