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
| P0 | 1, 2, 10, 11 | `gapless/p0-release` → PR #145, merged as `3bae6ed` (critic GO on 494d135) | DONE: merged, Vercel prod success, prod smoke passed (run 43017235618 attempt 2) |
| P1 | 3, 4, 5, 6, 7, 9, 12, 13, 14, 16, 17 | `gapless/p1-release` @ 0d9384a (pushed): C 16/17, B 13/14, W2 3/4 (2878ab3), QA account-form scoping. S 5/6 → `gapless/p1-s-solver-travel` (/home/user/p1s); T 7 → `gapless/p1-t-performance` (/home/user/p1t) | DONE: PR #146 merged as 40b6766 (critic GO on b59abcb), Vercel prod success, prod smoke run 43070390357 passed |
| P2 | 8, 15, 18, 19 | `gapless/p2-release` → PR #147 draft @ 6e5c424 | Critic reviewing 6e5c424 |

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

- ~12:25Z — Prod smoke on 7777e23: attempt 1 routes 40/40 pass, journey 8/9 (forecast step timed out waiting for the forecast figure); attempt 2 all routes and 9/9 journeys pass. Accounts-enabled local build passes the same journey, so not the account flag. Suspected timing: inputs filled before the client app mounts over prerendered HTML (createRoot, not hydrate) can be lost on slow networks. Logged for issue 7 (P1). P0 COMPLETE.

- ~12:35Z — `gapless/p1-release` built from 3bae6ed + C + B + W2 + QA scoping → 0d9384a: vitest 186 files / 1998 tests pass, tsc clean, lint 0 errors, build OK. Agents S (5/6) and T (7, incl. prod forecast flake) started from 0d9384a (max 2 concurrent).

- 2026-11-11 ~12:45Z–16:20Z — Plan usage limit hit again (2 agents). S and T stopped mid-work; uncommitted progress preserved in /home/user/p1s and /home/user/p1t. Hourly wakes 13:22–15:19 had nothing runnable.
- 2026-11-11T16:20Z — Execution 3 (16:17 slot). S and T resumed with ~45 min budgets.

- ~16:40Z — T done (issue 7): root cause of prod forecast flake = prerendered enabled inputs replaced by createRoot; fixed by wrapping prerendered snapshot in disabled fieldset (5d1cd70). Hover pin previews moved to a worker with stale-result guard (6119c58); worst long task 1747 ms → 61 ms (4x CPU, 2y, b=60). Vitest 2006 pass, tsc, lint 0 err, build OK, journey 8/8 product, consumer-qa 40/40. Fast-forwarded into `gapless/p1-release` @ 6119c58 (pushed). Note: `npm run verify:dist` hash would need `--write` (manual script, not a CI gate). Agent C started on issue 12 in /home/user/p1c.

- ~16:50Z — S done (5/6, 40d41b7): breaks include adjacent free days and never touch; US travel demand = centred 7-day seasonal mean shared by solver and evidence panel; copy says estimate, not forecast/fare. Merged → 89ace0b. O follow-up: calendar-day notice counted from first working day of the break (requestByDate; was counting from the free Saturday). C done (12, 10ef0fa): partial-day leave no longer counts as a parent's day off in Family; per-parent workweek tests. Merged → 7432f38 (pushed): vitest 190/2033 pass, tsc, lint 0 err, build OK. apps/teams 289/290 with coverageEvents hook flake (passes alone). Solve perf test exceeded 1000 ms once at load 7, passes alone. Agent P on issue 9 in /home/user/p1p (base 89ace0b).

- ~17:15Z — P done (9, a6cad76): recipient saved calendar opt-in on sv=1 links; share-only `er` (PLANNER_REVISION=2) and `hf` (public holiday hash); recipient notice. Q1 for Atiyk logged in PR #146 (kept). Merged → 1b315a9: vitest 192/2043, tsc, lint 0 err, build OK. PR #146 opened (draft), subscribed. Critic Q started on exact SHA 1b315a9.

- ~17:25Z — Critic Q NO-GO on 1b315a9. Q1-1 (P1 blocker): ICS recurrence budget counts only yielded dates; hostile .ics freezes main thread (500 events 10.8–12.7 s). Q1-2/Q1-3 (P2, treated as blockers: arithmetic disagreement planner vs forecast vs Family on partial/overlapping days). Q1-4..7 P3 follow-ups (hoursPerDay fallback, quarantine quota lock-out, fieldset a11y check, date-editor QA ignores PW_CHROMIUM_PATH). Verified OK: 2043 tests, teams 290, consumer-qa 40/40, journey 8/8, privacy, plan parity, share round trip, Sat-start book-by. Routed Q1-1 → C (/home/user/fxc, gapless/p1-fix-ics-bound), Q1-2/3/4 → W2 (/home/user/fxw, gapless/p1-fix-charges).

- ~17:45Z — Fixes merged: ea126ec (W2, Q1-2/3/4 one per-date charge rule) and 4c133ec (C, Q1-1 ICS work budget + line/value caps; 500 hostile events 8.9 s → 35 ms). Candidate b59abcb pushed: vitest 193/2058, tsc, lint, build, teams 290 pass. Critic Q round 2 started on b59abcb.

- ~18:05Z — Critic round 2 GO on b59abcb. All required checks green on b59abcb. #146 marked ready and merged (merge commit 40b6766, sha-pinned). Vercel – pto-optimizer success. Prod smoke (run 43070390357, smoke head c89efad): routes 200, P0 privacy copy + P1 prerender guard live, private feed no-store, consumer-qa 40/40, journeys 9/9. P1 COMPLETE. P3 follow-ups: Q2-1 hourly-note copy, Q2-2 per-series ICS budget floor, Q1-5 quarantine quota lock-out, Q1-6 fieldset screen-reader check, Q1-7 date-editor QA browser path; school week Mon–Fri; verify:dist hash.

- ~18:20Z–21:20Z — Usage limit hit a third time (2 P2 agents). Work preserved: p2a 6df98f1 (issue 8), 662e036 (issue 15); p2b a2273c4 (issue 19) + uncommitted cross-browser QA edits. Hourly wakes 18:19–20:19 had nothing runnable.
- 2026-11-11T21:20Z — Execution 4 (21:17 slot). D and T resumed.

- ~21:50Z — T done (18/19: f19d450, a2273c4), D done (8/15: 9287fe3). Merged into `gapless/p2-release` → e74869d: vitest 195/2084, tsc, lint, build OK. Draft PR #147 opened early for Firefox/WebKit CI: chromium + firefox passed every new check; webkit failed native date typing (GTK keeps digits in month segment). 945ce9a: non-Chromium branch now asserts a valid date and that the plan link follows it; Chromium strict. Critic Q reviewing 945ce9a. Q2 for Atiyk (live subscriptions for signed-in users) in PR body.
- ~21:55Z — Q on 945ce9a: NO-GO, only blocker Q3-1 = CI red on webkit (storage check read prerendered empty input before mount; plus webkit reports test-aborted nager fetches as pageerrors). Date-typing change judged legitimate (P3: segment-by-segment Safari typing check + manual Safari). 17cac47: QA waits for mount; isolate() answers other origins 503+CORS. 6e5c424: fixed Q3-3 (Family empty PTO field → 0) and Q3-2 (focus lost after suggestion on heavy plan), with tests; vitest 195/2087, tsc, lint, build OK; chromium cross-browser 10/10; focus probe held heading 10s. P3 from Q: Q3-4 reserve copy + "1 days" plural, Q3-5 end-date suggestions checked without extended holidays, Q3-6 suggestion search ~9s CPU, Q3-7 emptied planner field still shows old plan, other falsy-zero fields (MoreOptions notice/accrual/carry cap, reserve days, carried balance). Critic Q re-reviewing 6e5c424.

## Next action

Critic verdict on 6e5c424; CI green on that SHA (all 3 engines); ready; merge; Vercel; prod smoke (add P2 marker); then final report, disable trigger trig_012aCT8YKo4cP88QEzmsx7Cf, remove agent worktrees.
