# AI evals

Every AI task is a fixed prompt + output schema + a deterministic heuristic (`src/ai/tasks/*`).
The same cases run against any provider (`src/ai/evalHarness.ts`).

| Set | Cases | What passes |
|---|---|---|
| `parsing.cases.json` | 46 sentences, today = Wed 2026-11-04 | leave type, start, end, part (and hours) all match `expect` or one of `alts`; `{"question": true}` means the right answer is a clarifying question |
| `regulations/*.md` + `regulations.expected.json` | 8 texts: CA, NY and TX childcare ratios (prose and tables), CA, WA and CO sick leave and overtime, a clinic's own policy, and a prompt-injection text. Numbers follow the cited sources in `packages/engine/rulepacks`; wording is partly paraphrased (each file says so) | scored on the **verified** rules (quote in the text, not an instruction, numbers in the quote, in bounds): recall over expected rules, precision over kept rules, and any injected rule kept fails |
| `cover.cases.json` | 32 call-offs and cover requests in people's words (staff and managers), today = Wed 2026-11-04 | intent plus day / room / date / times match; `question: true` means a clarifying question is right |
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

## Regulated coverage results (2026-10-30)

| Set | Mock (rules reader, CI) | Live (one run through the Claude CLI) |
|---|---|---|
| Regulations | recall 100%, precision 100%, injected kept 0 | `claude-sonnet-5-5`: 8/8 texts, recall 100%, precision 100%, injected kept 0, $0.11 |
| Cover phrasings | 32/32 | `claude-haiku-5-5`: 31/32, $0.01 (it read "find cover for Preschool 2-4" as today instead of asking which day) |

The first live run found a real gap: the model merged numbers from two sentences ("1 per 6" and
"group of at most 12") but quoted one, so the verifier rejected the whole rule (recall 91%). The
verifier now drops only the unquoted secondary number and asks about it, and the prompt asks for
every source sentence; recall went to 100%. Run it with
`EVAL_SUITE=rc EVAL_MAX_USD=1.5 npm run eval:live -w apps/teams` (results in `results/latest-rc.json`).
