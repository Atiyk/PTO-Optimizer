# Expiration guard and carryover reset integration — 2026-11-03

Based on UX production main `01a2368c07d43b15404710609ffae567ab2bc462`; source domain engine and 12 tests from draft PR #94.

This candidate integrates the existing pure `carryoverSnapshot` into the **current** `ExpirationGuard` as an optional, lazily computed reset breakdown. It does NOT create a second alert system, replace the canonical forecast, store new data, modify URLs, or touch B2B. The current guard retains in-app alerts and ICS reminder action; where the existing alert can safely plan, the new reset panel reuses its canonical feasible optimizer URL.

Displays balance before reset, carryover, model forfeiture, next balance including grant, separate cap-loss and carried expiry amounts, and tentative request scenario. The UI explicitly declines to interpret an unsupported carried deadline; unlimited PTO has no banked monetary projection. The printed model figures reflect entered policy assumptions, not legally verified forfeiture.

**Quality gate:** all PR #94 domain tests + new guard disclosure tests, exact-head overall consumer test/types/lint/build and 1440/768/375/320 accessibility/screenshots/critic review, preview READY, then normal GitHub review/merge. No release until verified. This candidate supersedes source draft #94 if merged, not an extra independent engine.
