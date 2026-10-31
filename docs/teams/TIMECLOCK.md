# Time clock, timesheets, work rules and the compliance inbox

Status: built 2026-10-31. The prompt is `prompts/time-clock-and-compliance-prompt.md` in the
project folder. This extends `ARCHITECTURE.md` and `COVERAGE-ARCHITECTURE.md`. The boxes don't
change: surfaces, then the capability registry, then the engine and the DB.

Not legal advice. Overtime and break rules are configurable defaults for flagging and planning.
Nothing here computes, stores or exports pay.

## What it does

| Who | What |
|---|---|
| Staff (phone, `/m`) | The Today screen has one big button: clock in, start or end a meal break, clock out. It shows a live timer and "meal break due by HH:MM". At clock-out, sites with rest-break rules ask one yes/no question. The **Hours** tab shows the week with regular, overtime and double-time bands, plus anything worth checking. |
| Managers (`/app/time`) | A weekly grid per person and day, with overtime days underlined and the reason on hover. Issues are listed under each name. "Approve all" saves a snapshot of the engine's totals. Corrections void a punch and/or add one, with a reason. There is a CSV for payroll (hours by band, no rates). |
| Managers (`/app/compliance`) | An inbox in three groups: Needs you, Check and Heads-up. It holds missed clock-outs, meal and rest issues, overtime now, overtime the rest of the week's schedule will cause, last week's timesheets to approve, credentials expiring within 30 days, pending leave and open cover. Each item has a link to the fix. |
| Admins (`/app/admin/work-rules`) | The industry preset, the time clock switch, the overtime policy for cover, and a labour pack per site, with every rule's source and date. Changes apply as they are picked. |
| Cover ranking | Uses real hours. Days already worked use clocked hours, and future days use the schedule minus the meal that is owed. It runs the full overtime calculation (daily, weekly, double time, 7th day). The policy is `avoid` (default: rank last), `exclude` or `allow`. Salaried staff are treated as exempt. |

## Engine (`packages/engine/src/timeclock/`)

- **`punches.ts`** folds append-only punches into sessions, the current state and anomalies:
  - Anomalies are an out without an in, a stray break, a missing clock-out (the next clock-in
    arrived first), a forgotten clock-out (open more than 16 h) and an open break at clock-out.
  - Meal breaks are deducted; rest breaks are paid.
  - A session counts toward the local date it started on.
- **`overtime.ts`** turns a workweek (Monday to Sunday) into regular, overtime and double-time
  bands. It applies daily thresholds first, then the 7th consecutive day, then the weekly
  threshold on regular hours only. `projectOvertime` gives the premium hours one more shift adds.
- **`breaks.ts`** works out the meals a session owes and checks them:
  - Meal rules use `whenOverHours`, `startByHours`, `startAfterHours`, a local `window`, and
    `shiftStartsBefore` / `shiftEndsAfter`.
  - It flags missed, short, late, early and outside-window meals.
  - Rest breaks are counted per N hours, or per major fraction, and checked against the
    attestation.
- **`compliance.ts`**: `timesheetWeek` combines everything for one person-week, and
  `workRulesOf(pack)` pulls the rules.
- **Rule kinds.** `overtime_flag` gains `multiplier`, `doubleTimeDailyHours`,
  `doubleTimeMultiplier` and `seventhDay`. There are two new kinds, `meal_break` and
  `rest_break`.

## Rule packs (verified 2026-10-31)

| Pack | Overtime | Meal | Rest |
|---|---|---|---|
| `labor-us-federal` (new; default for US sites) | > 40 h/week at 1.5× (29 U.S.C. § 207(a)(1)) | none (DOL FLSA FAQ) | none |
| `labor-us-ca` | > 8 h/day and > 40 h/week at 1.5×; > 12 h/day at 2×; 7th day (Lab. Code § 510(a)) | 30 min for > 5 h, by hour 5; second meal for > 10 h (§ 512(a)) | 10 min per 4 h or major fraction; none under 3.5 h (wage orders § 12, DLSE FAQ) |
| `labor-us-wa` | > 40 h/week (RCW 49.46.130) | 30 min, starting 2–5 h into the shift (WAC 296-126-092(1)) | 10 min per 4 h (WAC 296-126-092(4)) |
| `labor-us-co` | > 12 h/day or > 40 h/week (COMPS 4.1.1) | 30 min for > 5 h (COMPS 5.1, CDLE INFO #4) | 10 min per 4 h or major fraction (COMPS 5.2) |
| `labor-us-ny`, `labor-us-ny-nyc` | > 40 h/week (12 NYCRR 142-2.2) | 30 min from 11:00 to 14:00 for > 6 h spanning it; 20 min from 17:00 to 19:00 for 11:00-to-19:00 days (Labor Law § 162) | none |

Each pack lists what it does not model, for example alternative workweeks, meal waivers, meal
premiums, factory rules and industry exceptions. Every number has a test in
`rulepacks.test.ts`.

**Rules resolution for a site.**
1. The site's linked coverage packs, if they carry work rules.
2. Otherwise the site's chosen labour pack (`locations.labor_pack_key`).
3. Otherwise FLSA, if the site is in the US.
4. Otherwise none.

## App

- **Schema** (`drizzle/0007_time_clock.sql`, additive, with a down script and an up→down→up test):
  - `time_punches`: append-only. A correction voids a punch and adds a new one with source
    `correction` and a note.
  - `timesheet_approvals`: a snapshot of the totals, superseded when a correction changes them.
  - `organizations.time_clock_enabled` (default off) and `overtime_policy` (default `avoid`).
  - `locations.labor_pack_key`.
  - `hours_worked.source` (`import` or `time_clock`).
  - More `vertical` values: healthcare, retail, hospitality, security and manufacturing.
- **Hours sync.** Every clock-out and correction voids the person's `time_clock` row in
  `hours_worked` for that workweek and writes the new total. Hourly sick-leave accrual then uses
  real hours. Don't also import hours for weeks the clock covers.
- **Capabilities:**

  | Capability | Who | Surfaces |
  |---|---|---|
  | `clockPunch` | people only | UI, REST |
  | `getMyTimeClock` | | UI, REST |
  | `getTimesheets` | | UI, REST, MCP, assistant (MCP tool 25 of 25) |
  | `manageTimesheets` | people only | UI, REST |
  | `getComplianceTasks` | | UI, REST |
  | `getWorkRules` | | UI, REST |
  | `manageWorkRules` | admin | UI, REST |

  New scopes: `time:clock` (employee and up) and `time:approve` (manager and up).
- **Tests:**
  - The engine: the fold, DST, every overtime rule, every break rule, and the ranking policies.
  - The capabilities: people-only punching, the state machine, idempotency, the hours sync,
    approvals and corrections, visibility, and the compliance inbox.
  - Tenant isolation attacks for each new id-taking capability.
