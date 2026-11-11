# Gapless P0 → P1 → P2 orchestrator checkpoint

Durable status record for the 19-issue release workflow (owner brief 2026-11-11T06:17Z).
Project memory is off, so this file on branch `gapless/orchestrator-checkpoint` is the
source of truth between scheduled executions. No sensitive user data belongs here.

## Lock

- Owner: Claude Code orchestrator session `session_01Fy88h8ZbDnL4WU9QaopvcP` (project thread "Ship Gapless P0, P1, P2 releases").
- State: HELD since 2026-11-11T06:17Z.
- Prior lock: Codex "Timebower VC batch" lead (issue #143, PR #144). Last heartbeat 2026-11-10T13:42:57Z; its promised hourly schedule never wrote another checkpoint or commit in 16.5 hours, and its own hard stop is 2026-11-13T02:30Z. Treated as stopped. Its branch `timebower/vc-integration` is NOT pushed to by this workflow; P0 builds on a copy of its head `27e4a158` so that work is reviewed rather than discarded.

## Schedule

- Scheduled task `trig_012aCT8YKo4cP88QEzmsx7Cf` "Gapless P0/P1/P2 orchestrator (5-hour cadence)", cron `19 * * * *` UTC (server-anchored hourly), bound to this session, enabled.
- The scheduler has no native 5-hour interval: `*/5` cron resets at midnight (20:00→00:00 is 4h). So it fires hourly and each wake runs a full execution only when due on the 5-hour grid below; other wakes exit without changes.
- 5-hour grid (UTC), anchor 2026-11-11T06:17Z: 11:17, 16:17, 21:17 (Nov 11); 02:17, 07:17, 12:17, 17:17, 22:17 (Nov 12); 03:17, 08:17, 13:17, 18:17, 23:17 (Nov 13).
- Hard stop: 2026-11-14T02:30Z (Fri Nov 13 9:30 PM ET). Freeze new work/merges/deploys at 02:15Z.

## Baseline (2026-11-11T06:17Z)

- main = production = `68e4f2201fdabe8458eda0e6526d53dcbf912120` (#142). Vercel consumer deploy READY.
- Required checks on main (ruleset Rules-2, strict): "Consumer tests, types, lint, build", "Consumer browser and visual evidence". PR required, 0 approvals, conversation resolution required. No force-push/deletion on main.
- GitHub Actions are running again (billing failures of 2026-11-06 no longer observed).
- Open PR: #144 draft `timebower/vc-integration` @ `27e4a158` (CI green, no critic GO).

## Batches

| Batch | Issues | Branch / PR | State |
|---|---|---|---|
| P0 | 1, 2, 10, 11 | `gapless/p0-release` → PR #145, merged as `3bae6ed` (critic GO on 494d135) | Merged; Vercel prod success; prod smoke in progress |
| P1 | 3, 4, 5, 6, 7, 9, 12, 13, 14, 16, 17 | C 16/17 @ b42baa7; B 13/14 @ dea2dcf; W2 3/4 in progress | In progress |
| P2 | 8, 15, 18, 19 | — | Not started |

## Issue traceability

| # | Sev | Owner | Branch @ SHA | Root cause / finding | Fix | Tests | Critic | Batch |
|---|---|---|---|---|---|---|---|---|
| 10 | P0 | B | p0-b-workweek @ 5c252f0 (critic: pass) | Real infinite loop in engine `teamPlan.ts` blocksFor with workweek 0000000 (B2B planShape); deadline search walked ~11k days; `returnToWorkDate` invented end+1; `/policy` accepted ww=0000000 | `workdaySearch.ts` 732-day bound returning null; null handled in OOO/approval/ICS; link notice for invalid workweek | 5 engine + 9 consumer, failing first | pending | P0 |
| 2 | P0 | P | p0-p-share-privacy @ 60c76b9 | Much fixed by #131/#134/#137/#140. Remaining: address bar blocklist (not allowlist); feed CDN-cached legacy private params; Vercel beforeSend spread extra fields; 3 drifting private-key lists | `shareFormat.ts` v1 allowlist, partitions, feed private no-store, analytics {type,url} | 23 added | pending | P0 |
| 1 | P0 | W | p0-w-workspace-ledger @ 76274c2 (critic: W-1 blocker) | Forecast, expiry guard, planner, family each had own request-charge rules | `src/personal/workspace.ts` single deduction rule + `usePersonalWorkspace` | 15 added | pending | P0 |
| 11 | P0 | W | same | Planner ignored planned/requested; approved reserve default off (disagreed with My PTO); expiry guard double-counted; family ignored ledger | same | same | pending | P0 |
| 16 | P1 | C | p1-c-ics-holidays @ b42baa7 (local, base 6009e25) | icsImport.ts:228 dropped every recurring VEVENT; Family rejected whole file | `icsRecurrence.ts` bounded RRULE/EXDATE/RDATE/RECURRENCE-ID expansion; unsupported reported by name | 46+ | pending | P1 |
| 17 | P1 | C | same | Bundled data 2026–2028 only; empty Nager answer cached as 'no holidays', degraded=false | `uncoveredYears` + HolidayCoverageNotice; no empty caching. Follow-up: extend bundled range at build (Nager is free) / move notice into useAppState | 18 | pending | P1 |

Residual risks noted by P (not fixed): `/api/watch` and reminder-email links carry balance by design after opt-in; `/api/inbound` secret in query string; browser history keeps originally-opened URLs.

## Log

- 2026-11-11T06:17Z — Execution 1 started. Repo inspected, scheduler created, checkpoint created.

- 2026-11-11 ~06:50Z — B, P, W reports in; merged locally into gapless/p0-release. W asked to keep tracked breaks visible (override of 'disappear on track').

- ~07:15Z — PR #145 opened (head 6b188a8). Required check 'Consumer browser and visual evidence' failed: journey 'Partner sharing…' finds no break card after tracking because committed cards lack data-break-* + partner action. W fixing in product. Critic Q reviewing 6b188a8. C finished 16/17 locally.

- 2026-11-11T07:19Z–11:10Z — Plan usage limit (5-hour window) exhausted after ~1h with 5 parallel agents; all agents and this session stopped; hourly wakes 07:19–10:19 queued without work. Agents B(13/14) and S(5/6) died before producing commits. LESSON: run at most 2 agents concurrently; keep P1 work serialized behind P0.
- 2026-11-11T11:20Z — Execution 2 (11:17 slot). Resumed W (committed-card partner fix) and critic Q on P0.

- ~11:40Z — Critic Q: NO-GO on 6b188a8. W-1 P0 blocker: Family double-charges approved/tentative leave. P-1 P1: expiry handoff links carry `bo` private dates in navigable URL. X-1 P2 headline 'not placed' mislabels reserved days. W-2/P-2/P-3/X-2 P3. Verified: issue 10 bound, issue 2 surfaces, 17/17 hand arithmetic, no overflow/axe 0 at 4 widths. Routed W-1/X-1/W-2 → W, P-1/X-2 → P. 052ad15 pushed (committed-card partner fix).
- P-3 owner question: planning budget `b` is public in links (needed for URL round-trip) — kept public.

- ~11:50Z — Fixes f1bdf68 (W) + 27e67c6 (P) integrated → P0 candidate 5d4d36e (local 1862/1862, tsc, lint, build). Critic round 2: GO on 5d4d36e. P3 follow-ups H-1/H-2/P-3 deferred. Waiting on required CI for 5d4d36e.

- ~12:00Z — #145 merged (merge commit 3bae6ed) after both required checks green on 494d135 (320px privacy overflow fixed). Vercel status success. Prod smoke via GitHub Actions workflow on `gapless/prod-smoke` (container cannot reach vercel.app): routes 200, P0 privacy copy live, feed with private key → `private, no-store`. consumer-qa flagged formSubmitControls=1 on /pto: the opt-in email sign-in form, which renders only where accounts are enabled (prod, not CI) and is unchanged since #142. Not a P0 regression; QA now counts it separately (7777e23), carried into P1.

## Next action

Confirm prod smoke run on 7777e23 (routes + journey). Then build `gapless/p1-release` from 3bae6ed: integrate C (b42baa7), B (dea2dcf), W2 (3/4) when done, plus the consumer-qa account-form scoping. Remaining P1 (5, 6, 7, 9, 12) at most 2 agents at a time.
