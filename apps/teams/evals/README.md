# AI evals

Every AI task is a fixed prompt + output schema + a deterministic heuristic (`src/ai/tasks/*`).
The same cases run against any provider (`src/ai/evalHarness.ts`).

| Set | Cases | What passes |
|---|---|---|
| `parsing.cases.json` | 46 sentences, today = Wed 2026-11-04 | leave type, start, end, part (and hours) all match `expect` or one of `alts`; `{"question": true}` means the right answer is a clarifying question |
| `handbooks/*.md` + `handbooks.expected.json` | 6 handbooks (US front-loaded, UK custom year, hourly accrual with cap and waiting period, unlimited, a prompt-injection handbook, a silent one) | scored on the **verified** result (after quote and bounds checks), field by field |

## CI (no network, no cost)

`npm test -w apps/teams` runs `src/ai/evals.test.ts` with the mock provider, i.e. the built-in rules
that also serve as the no-AI fallback. Current: parsing 45/46 (misses "Christmas Eve"), handbook
fields 100%. The rules were written alongside these cases, so treat those numbers as a regression
floor, not as evidence of how well they generalise. The live run below is the real measurement.

## Live run (real model, costs money)

```
ANTHROPIC_API_KEY=... npm run eval:live -w apps/teams     # optional: EVAL_MAX_USD=1 (default)
```

It refuses to start if the worst case could exceed `EVAL_MAX_USD`, then writes
`evals/results/latest.json` with accuracy, tokens and cost per task. Expected cost is a few cents
(parsing on `claude-haiku-5-5`, handbooks on `claude-sonnet-5-5`). If Haiku clears the handbook set
too, set `AI_MODEL_IMPORT_HANDBOOK=claude-haiku-5-5` to cut that cost about 20x.
