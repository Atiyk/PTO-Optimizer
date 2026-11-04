# Consumer departure payout integration candidate — 2026-11-03

Based on UX production main `01a2368c07d43b15404710609ffae567ab2bc462`. Source domain foundation: draft PR #91, with 16 engine tests and primary-source research notes. The source files are imported byte-identically into a new independently runnable consumer-only UI candidate.

**New:** `DeparturePayoutEstimator` on the existing /policy page, with hourly/annual wages, actual work-jurisdiction input, separation date, four employer-rule assumptions, cap, currency, and an *opt-in* for treating otherwise uncategorized tracked requests as vacation. The domain engine remains canonical via `forecastWithRequests`. The component does not modify localStorage, routing, URL state or analytics; salary and jurisdiction remain in private React state only.

**Explicit limits:** This UI supports one vacation line, not multiple leave categories yet; mandatory jurisdiction law always `not-verified` and no right is asserted. Currency does not convert. The dedicated /tools/pto-payout route and cross-country/verified legal baselines remain future work, subject to first-party legal research and independent review. The user's entered work jurisdiction is a label, not a law lookup. Other leave types require distinct policy and category-aware ledger.

**Release gates:** new UI tests, exact-head consumer tests/types/lint/build, 1440/768/375/320 screenshots, a11y and privacy inspection, independent legal/QA critic and READY preview. Not approved or released until all mandatory checks complete. This candidate supersedes PR #91's code only if integrated and approved; do not merge #91 separately afterwards.
