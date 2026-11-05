# Gapless consumer autopilot — run status

State: **ready for review.** Integration branch `claude/gapless-consumer-autopilot`, stacked on PR #114.
Directive: [docs/GAPLESS-AUTOPILOT-MULTIAGENT.md](../../GAPLESS-AUTOPILOT-MULTIAGENT.md).
Critic report: [QA-20261104.md](QA-20261104.md).

| Workstream | Agent | State | Notes |
| --- | --- | --- | --- |
| F1 Live plan feed, F2 book-by nudges | C | done | `/api/feed` re-solves the plan from the plan URL; byte-identical to the download for the same day |
| F3 Expiry rescue | P | done | Rescue dates inline in the guard and in reminders; `/api/watch` recomputes against today |
| F4 Request autopilot | R | done | Local parser, confirm action, OOO `.ics` and message draft, submit-by dates |
| F5 Balance from a screenshot | V | done | tesseract.js 7 in the browser, lazy-loaded, model self-hosted; image never uploaded |
| Vercel function wiring | O | done | esbuild bundle in `api/_bundle` with holiday data embedded; `maxDuration` 10 |
| Critic review | Q | done | 1 red (feed memory on huge plans) fixed; ambers 3–5 fixed; rest logged below |

## Critic findings left open (not blocking)

- Expiry rescue can suggest days inside the 14-day notice period (QA amber 2). Logged as a question below.
- Book-by dates can land on a weekend or holiday (QA low 6).
- Approval parser does not decode `&ndash;` and numeric HTML entities; only matters for the future inbound-email path (QA low 7).
- Balance reader rough edges: no paste `maxLength`, "tap" wording on desktop (QA low 8).

## Questions for Atiyk

1. **Rescue timing.** Should the expiry rescue only suggest days after your notice period (14 days by default)? Today it may say "Take Nov 6–8" when the deadline is close, which is honest about the deadline but may be too short notice for your manager.
2. **Feed size.** Calendar feeds cover plans up to 3 years and 80 PTO days (balance plus accrual). Bigger plans still work in the app and as a downloaded `.ics`. Raise only with a paid function tier.
3. **Owner prerequisites** (not built): outbound email for nudges, inbound address for forwarded approvals, optional vision model key, optional database for sign-in, privacy policy update. See section 4 of the directive.
4. **Preview protection.** Calendar apps cannot subscribe to a protected Vercel preview (they get 401). Production is public, so this only matters for testing on previews.
