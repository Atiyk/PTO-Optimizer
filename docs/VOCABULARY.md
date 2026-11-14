# Vocabulary standard

One chosen word per concept, used in all UI copy across the site. The alternatives are not
wrong — they're what glossary aliases exist for (Stage 3A) — but they must never appear in
our own interface strings. A lint/test step (see `src/content/vocabulary.ts` and its test)
flags any banned alternative found in a UI string literal.

| Concept | Use this | Not this (become glossary aliases) |
|---|---|---|
| The bank of days this site plans | PTO | vacation days, annual leave, holiday allowance |
| A day added to the balance over time | accrual | rollover accrual, earning |
| A day that doesn't carry forward | carryover | rollover, roll-over, carry forward |
| Losing days at reset | forfeited / forfeiture | use-it-or-lose-it, lapsed, expired days |
| A single-day employer holiday the employer picks | floating holiday | personal holiday, flex holiday |
| A statutory/employer-recognized holiday | company holiday | observed holiday (reserve "observed" for the date-shift sense already used in `isObserved`) |
| The date balances reset | reset date | plan-year end, anniversary date (only when the plan year genuinely is anniversary-based) |
| The maximum balance you can hold | accrual cap | balance cap, PTO ceiling |
| Days blocked from being requested | blackout period | blackout dates, restricted period |
| How far ahead you must ask | notice period | lead time, advance notice |
| A bank with no fixed number of days | unlimited PTO | flexible PTO, discretionary PTO |
| Money paid out for unused days on leaving | payout | cash-out, PTO payout (redundant) |
| Time away with no accrual and no pay | unpaid leave | LOA (spell out "leave of absence" on first use, then may alias) |
| Every calendar day you're not working: weekends, holidays and PTO days together | days off ("31 days off", "18 days off in a row") | calendar days off, days away, time away, consecutive days. Keep "PTO days" for the cost: "18 days off for 10 PTO days" |

This list grows as later Understand features add concepts; append, never silently rename an
existing row (old links/content may already use the chosen word).
