# Regulated coverage: product spec

Status: Phase 1 of the "Regulated coverage" build, 2026-10-30. Architecture:
`COVERAGE-ARCHITECTURE.md`. MVP spec: `SPEC.md` (still the contract for everything not
named here).

**Not legal advice.** Every rule the product shows carries a citation (regulation,
section, URL, retrieval date) or the label "needs verification". The UI says so wherever
rules appear. Customers confirm their own rules.

## 1. Who it is for

First vertical: licensed **childcare centres** (10–80 staff, 1–5 sites). The state's
staff-to-child ratio is the coverage rule; qualified roles (fully qualified teacher,
director-qualified, CPR/first aid) set eligibility. Second vertical, configuration only:
a small **clinic** (dental or vet), where a licensed role (hygienist, vet tech) must be
present for booked work.

### Personas and weekly jobs

| Persona | Weekly jobs |
|---|---|
| **Centre director / owner** | Keeps every room in ratio and the licence safe; approves leave knowing what it does to ratios; finds cover fast when someone calls off; keeps credentials current before an inspection; pays sick leave correctly for hourly staff. |
| **Room lead** | Knows who is in the room and when; flags gaps for the afternoon; covers short breaks; asks for help in words ("need someone for toddlers 2–6 Friday"). |
| **Floater** | Sees open cover offers that fit them, accepts in one tap, and is not always the one asked. |
| **Office manager** | Sets up rooms, schedules, enrolment counts and credentials; imports hours worked from payroll; answers "why is my sick balance X". |
| **Staff member** (mostly not on Slack, phone first) | Sees their schedule and balances, requests leave, reports "can't come in" in two taps, answers cover offers, sees when their CPR expires. |
| **Clinic manager** | Keeps a licensed role present for every booked block; finds a qualified fill-in when a hygienist is out. |
| **Hygienist / vet tech** | Same as staff member; their licence is the credential that makes them eligible. |

## 2. Entities

All tables: `id`, `org_id`, `created_at`. Everything is additive to `SPEC.md` §2.

| Entity | Fields |
|---|---|
| **Site** | = existing `locations` (timezone already there). Plus `rule_pack_id` via `site_rule_packs` (effective from). |
| **Room / Post** | site_id, name, kind (`room` / `post`), age_group (childcare, from the pack's age groups) or service (clinic), archived. |
| **Credential** | org credential type: key (e.g. `fully_qualified_teacher`, `cpr`, `first_aid`, `director_qualified`, `rdh_licence`), name, needs_expiry. |
| **MemberCredential** | member_id, credential_id, issued_on, expires_on (nullable), evidence_ref (free text: where the certificate is; never a file of the person's ID), verified_by_member_id, verified_at. Alerts at 30/14/7 days before expiry. |
| **RulePack** | key, version, jurisdiction {country, state, city?}, vertical (`childcare` / `clinic`), effective_from/to, age_groups (ordered youngest → oldest), mixed_age method, rules[]. Every rule: `citation {regulation, section, url, retrievedOn, publisher, quote?}` or `needsVerification: true` with a reason, and `basis` (`law` / `org_policy`). Versions are immutable; edits create a new version. |
| **Rule kinds** | `ratio` (age group → children per staff, max group size), `role_present` (credential, min count, scope room/site, when children present), `min_rest_between_shifts` (hours), `max_hours_per_day`, `max_hours_per_week`, `max_consecutive_days`, `overtime_flag` (daily/weekly thresholds; cost flag, not payroll), `sick_accrual` (rate per hours worked, annual accrual cap, annual use cap, balance cap, carryover, frontloading option, waiting period). |
| **Demand** | room_id, weekly template rows (weekday, start, end, age_group, **count**) + dated exceptions (date, start, end, age_group, count, or closed). **Counts only.** Clinic demand: booked-role blocks (date, start, end, required credential, count), entered or CSV. |
| **Schedule** | shift_templates (member_id, room_id, weekday, start, end local time, effective range) + shift_exceptions (member_id, date, start/end or `off`, room_id). Shifts may cross midnight (end ≤ start means next day). |
| **HoursWorked** | member_id, period_start, period_end, hours (imported from payroll / time clock CSV). Append-only with an import batch id (rollback = void the batch). |
| **CoverRequest** | site_id, room_id, date, start/end, the gap snapshot (rule broken, required, present, citation), source (`leave_request` / `call_off` / `credential_lapse` / `manual`), source_id, status (fold of events), wave config (size, wait minutes), decided_by. |
| **CoverOffer** | cover_request_id, member_id, wave, rank, sent_at, channel, response (`accepted` / `declined` / `expired` / `superseded`), responded_at. |
| **CoverEvent** | APPEND-ONLY. cover_request_id, at, kind (`created`, `ranked`, `offers_sent`, `accepted`, `declined`, `rule_recheck_failed`, `filled`, `cancelled`, `reverted`), actor, data (ranked snapshot, reasons). |
| **Fairness ledger** | Derived from `filled` events: per member, cover taken (count, hours), holiday cover, short-notice cover (< 24 h before start), in a rolling 90-day window. Never a mutable counter. |
| **MemberCoverPrefs** | member_id, opt_in (`yes` / `no` / `ask`), allowed_site_ids, max_extra_hours_week. |
| **MemberPayRate** | member_id, hourly_rate, effective_from. Exists only while the org has cost-aware ranking on. |

## 3. The required-staff computation

For each site, date and **time block** (default 30 minutes, labelled in the site's local
time; DST handled by walking real UTC instants) and each room:

```
children_g   = demand count for age group g in the block (template, then date exceptions)
governing    = the age group whose ratio applies, by the pack's mixed-age method:
                 youngest     the youngest group present                 (CA 101616.5(e), NY 418-1.8(l)(9),(l)(10))
                 majority     the group with the most children; tie → younger   (NY 418-1.8(l)(6), 3–5-year-olds)
                 core_child   sort children youngest → oldest, take the child at
                              position ceil(N/2); its group governs        (TX 746.1603)
                 proportional ceil(Σ_g children_g / ratio_g)   (org choice, not a cited method)
ratio_req    = 0 if N = 0, else ceil(N / ratio(governing))      (proportional: as above)
group_viol   = N > maxGroupSize(governing)                       (staffing can't fix this; flagged)
role_req_r   = rule r's min when its condition holds (children present / site open), else 0
present      = staff scheduled in the room for the block
               − on approved (or, for "likely", pending) leave covering the block
               − ineligible: lacks a credential the pack requires to count in ratio,
                 or that credential has expired on that date
present_r    = present staff holding rule r's credential, valid on the date
                 (scope `site`: across the site's rooms)
required     = max(ratio_req, max_r role_req_r)
gap          = max(ratio_req − present, max_r (role_req_r − present_r), 0)
```

Every shortfall carries the rule's citation (or "needs verification") so the heatmap and
explanations can say exactly which rule is broken.

### Hand-verified examples (these are tests in `requiredStaff.test.ts`)

1. **CA toddler room, 14:00 block (RC2).** 12 toddlers; toddler ratio 6
   (HSC 1596.955(a)(3)); max group 12 (HSC 1596.955(a)(4)). `ratio_req = ceil(12/6) = 2`.
   Scheduled: Ana, Ben. Ben is on approved leave 14:00–18:00 → `present = 1`, `gap = 1`
   for every block 14:00–18:00. Before 14:00 `gap = 0`.
2. **NY mixed toddler + preschool, 07:00 (start of day).** 4 toddlers (1:5) and 6
   three-year-olds (1:7); method `youngest` (418-1.8(l)(9)) → toddler ratio 5,
   `N = 10`, `ratio_req = ceil(10/5) = 2`; max group 12, `10 ≤ 12`, no group violation.
3. **TX core child.** 2 children aged 18–23 months (1:9), 5 two-year-olds (1:11),
   4 three-year-olds (1:15). `N = 11`, core = `ceil(11/2) = 6`; the 6th youngest is a
   two-year-old → ratio 11 → `ratio_req = ceil(11/11) = 1`; max group 22.
4. **Proportional (org choice).** 3 infants (1:4) + 4 toddlers (1:6):
   `3/4 + 4/6 = 1.4167` → `ratio_req = 2`.
5. **Expired credential.** CA pack requires `fully_qualified_teacher` to count in ratio
   (configured by the org, `basis: org_policy`, because Title 22 qualification rules live
   in 101216.1 and are not modelled field by field yet). Cy's credential expired yesterday
   → Cy is scheduled but not counted; gap appears from that date.
6. **Role present.** Site rule "1 CPR-certified staff present while children are on site"
   (`org_policy` unless the pack cites a source). Two rooms open, the only CPR holder on
   leave → site-level role gap of 1 on every open block.

## 4. Cover ranking

Input: the gap (site, room, date, blocks, credential needs), all members, their
schedules, leave, credentials, cover preferences, the fairness ledger, the pack's work-time
rules, the org's cost setting.

**Hard filters, in order** (each candidate records every check, pass or fail):

| # | Check | Fails when |
|---|---|---|
| H1 | `active` | member ended, deleted, or is the absent person |
| H2 | `site_allowed` | the site is not in the member's allowed sites (default: home site only) |
| H3 | `opted_in` | the member opted out of cover offers |
| H4 | `not_on_leave` | approved or pending leave overlaps the cover |
| H5 | `available` | already scheduled in another room at an overlapping time |
| H6 | `credential_valid` | missing a credential the gap needs, or it expires on or before the date |
| H7 | `min_rest` | rest between the cover and an adjacent shift < the pack's minimum |
| H8 | `max_hours_day` | scheduled + cover hours on that day > the maximum |
| H9 | `max_hours_week` | scheduled + cover hours in that week > the maximum |
| H10 | `max_consecutive_days` | taking the cover makes the run of worked days longer than allowed |

**Score** (integers, lower is better), only for candidates that pass every filter:

```
score = 100 × coverTaken90d + 50 × holidayCover90d + 30 × shortNoticeCover90d   (fairness)
      − 40 if opt_in = yes                                                       (preference)
      + 200 if cost-aware ranking is on and the cover puts the member in an
            overtime band by the pack's overtime flags                           (cost)
      + 25 if the cover site is not the member's home site                       (travel)
tie-break: member id ascending (stable for an org; same convention as the planner)
```

Pay rates never leave the engine call; the output says `costBand: regular | overtime`.

**Hand-verified example (RC3).** Gap: toddler room 07:00–11:00. A has an expired CPR
(H6 fails). B's previous shift ended 23:00 the night before; org rest minimum 10 h;
`07:00 − 23:00 = 8 h < 10 h` (H7 fails). C took 2 covers in 90 days (score 200), D and E
none (score 0), ids D < E. Result: D (0), E (0), C (200); A and B listed as excluded with
the reason.

**Waves.** `requestCover` sends offers to the top `waveSize` (default 3), then the next
wave after `waitMinutes` (default 15) if nobody accepted. First eligible acceptance wins:
the accept runs in a transaction that re-checks every hard filter at that moment and
inserts the `filled` event under a unique `(cover_request_id)` constraint, so two
simultaneous accepts cannot both win; the loser gets "already filled".

## 5. Hourly sick-leave accrual (C4)

Extends `LeavePolicy` (`SPEC.md` §3), not a parallel model: `per_hour_worked` gains
`hoursSource: 'imported'`, `hoursPerUnit` (exact "1 per 30" without a rounded rate),
`annualAccrualCap` and `annualUseCap`. Existing `accrualCap` (balance cap), `carryover`,
`waitingPeriod` (`locked` = accrues but not usable) and `front_loaded` are reused.

Accrual is credited on each imported period's end date with cumulative rounding within the
plan year (`round(H_k/30) − round(H_{k−1}/30)` in 1/10000 units), so the year's total is
exact.

### Hand-verified examples (tests in `sickAccrual.test.ts`)

- **CA (Lab. Code 246, after SB 616).** 1 per 30, balance cap 80, use cap 40/yr (employer
  option), usable from day 90, carryover subject to the cap. Hired 2026-01-05, 40 h/week
  imported weekly (weeks Monday–Sunday, credited on Sunday). Weeks ending by 2026-03-29:
  12 × 40 = 480 h → 16 h accrued, locked until 2026-04-04 (day 90). The 51 weeks ending in
  2026: 2,040 h → 68 h, all carried into 2027; in 2027 the balance reaches the 80 h cap
  after 12 h more (360 h worked, 9 weeks) and accrual pauses.
- **CA frontloaded.** 40 h on each 2026-01-01 and 2027-01-01, no carryover: unused 40 is
  forfeited at year end and replaced by 40.
- **NYC (100+ employees).** 1 per 30, annual accrual cap 56, carryover up to 56, use cap
  56/yr. 2,000 h in 2026 → 66.67 earned but capped at 56; used 20 → 36 carried; 2027:
  earns up to 56 more (balance up to 92) but can only use 56 in 2027.

## 6. Visibility and minimisation

- Staff see their own schedule, balances, credentials and offers; room-level coverage of
  their own site (counts, not other people's leave types); managers see their sites;
  admins everything.
- **Call-off reasons are not stored** by default (`call_off_reasons_enabled = false`).
  The leave request created by a call-off uses the org's sick or unplanned type with no
  note. Webhooks, Slack and exports show it as "out".
- **No child data.** Demand is `(room, block, age group, count)`. No table or API field
  for child names, dates of birth, addresses, guardians, medical or allergy information, or
  any per-child id. Enforced by `schema.childData.test.ts` (every column, every capability
  input/output schema, against a deny list).
- **Pay rates**: admins only, never to tokens, the LLM, logs, webhooks or exports to
  non-admins.

## 7. Capability catalog additions

| Capability | Effect | Scope | Roles | Autonomy default | Surfaces |
|---|---|---|---|---|---|
| getCoverage | read | coverage:read | any (own site); manager+ (all) | n/a | ui, rest, mcp, slack, assistant |
| findCover | read | cover:request | owner, admin, manager | n/a | ui, rest, mcp, assistant |
| requestCover | commit | cover:request | owner, admin, manager | Agents: L2 Draft | ui, rest, mcp, slack, assistant |
| respondToCover | commit | cover:respond | any member (own offers) | People only for accept | ui, rest, mcp, slack, assistant |
| reportCallOff | commit | cover:respond | any member (self) | Agents: L2 Draft | ui, rest, mcp, slack, assistant |
| getCoverageForecast | read | coverage:read | owner, admin, manager | n/a | ui, rest, mcp, assistant |
| draftRulePackFromText | draft | rules:draft | owner, admin | Never saves | ui, rest, mcp, assistant |
| saveRulePack | commit | admin | owner, admin | People only | ui, rest |
| manageSchedule | commit | admin | owner, admin | People only | ui, rest |
| manageCredentials | commit | admin | owner, admin | People only | ui, rest |
| importHoursWorked | commit | admin | owner, admin | People only | ui, rest |

Extended: `draftLeaveRequest` and `decideLeaveRequest` add `blockCoverage` (per-block
gaps the absence creates, with citations) for sites with a rule pack; auto-approval (D4)
fails hard on any new ratio or role gap. MCP total: 17 + 7 = 24 ≤ 25.

## 8. Acceptance scenarios

RC1–RC12 as in the build prompt (setup in under 10 minutes of clicks; toddler gap with
citation; cover ranking with exclusions; concurrent accepts; two-tap call-off with no
reason; CA and NYC accrual; cited rule draft with injection; credential expiry in alerts
and forecast; AI off; service agent limits; MVP regression; clinic pack by configuration).
Each has an automated test and screenshots by Phase 7.

## 9. Out of scope

Payroll, a time clock, billing, child records or check-in, parent communication, native
apps, union rules, predictive scheduling ("fair workweek") laws, automatic schedule
generation beyond cover and stagger suggestions.
