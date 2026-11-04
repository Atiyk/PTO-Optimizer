# GAPLESS — FAMILY & SCHOOL-BREAK PLANNER MULTI-AGENT DIRECTIVE

## Run mode (unattended, owner-approved 2026-11-04)

The owner asked for this to run as multi-agent workstreams "with full approval". For this run only:
work on stacked branch `claude/family-school-planner` (based on PR #114's `claude/gapless-consumer-redesign`,
which is still open), push it, open **one draft PR** against that branch, and post a preview.
**Hard stops:** no merge, no push to `main`, no branch deletion, no force-push of anyone else's branch,
no account/settings changes, no production deploy. Owner decisions are logged under
"Questions for Atiyk" in the PR and in `docs/runs/family-planner/STATUS.md` instead of blocking.

Every other rule in `CLAUDE.md` holds in full: no submit/Generate buttons, no multi-step forms,
free-form date pickers, every control round-trips through the URL, no backend, no accounts,
no stored personal data, and `npm run build` must pass.

## Mission

A separate planner at `/family`, modelled on `/sabbatical`, for parents planning PTO around
school breaks. It answers two questions live, with no submit step:

1. **Which school breaks should I take off to get the most days with my kids, within my PTO?**
2. **Which school-off days are still uncovered** (school is closed, I work, and nobody else is on)?

## Agents and ownership

| Agent | Owns | Must not touch |
| --- | --- | --- |
| **O — Orchestrator** | this brief, the contract, integration, STATUS.md, PR | — |
| **C — Calendar domain engineer** | `src/personal/familyPlan.ts`, `src/personal/schoolDateText.ts`, `src/ui/familyUrlState.ts` + tests | UI components, `packages/engine` |
| **R — School-calendar research** | `src/content/schoolDistricts/**` + `docs/runs/family-planner/DISTRICT-SOURCES.md` | any code outside that folder |
| **U — Family UI & imports** | `src/ui/Family*.tsx`, `src/family-main.tsx`, `family/index.html`, route/nav/prerender wiring, OCR loader | domain modules (consume them via the contract) |
| **Q — Independent critic (blocking)** | review notes in `docs/runs/family-planner/CRITIQUE.md` | — |

Q runs after integration. Implementer tests are not independent sign-off.

## Non-negotiable product and privacy rules

- **Dates only.** No child names, school names typed by the user, event titles from personal
  calendars, or photos are stored or put in URLs. Preset labels ("Winter recess") come from the
  district's public calendar and are fine.
- **Coverage is always partial.** Never claim "no gaps"; say "no gaps found in the dates you added".
  Never infer unlisted dates are school days (`SCHOOL-CONFLICT-CONTRACT.md`).
- **One ICS parser.** `src/ui/icsImport.ts` only. School calendars go through `buildSchoolCalendar`.
- **Photos are read on the device.** OCR runs in the browser; the image is never uploaded, is
  released from memory after reading, and every extracted date must be confirmed by the user
  (nothing is added unconfirmed). Self-host OCR assets so no third-party request is made.
- **Presets are sourced, not guessed.** Each district has an official source URL, retrieval date
  and school year; the UI shows them and says "not a directory of every district — check your
  school's own calendar".
- **Sharing is a link with dates only**, reusing the partner-share approach. The recipient sees the
  school dates and the sender's chosen available dates, nothing else.

## Gated releases

- **F1 domain** — planner math, date extraction, URL state, tests green.
- **F2 data** — verified district presets.
- **F3 UI** — /family route with imports, sharing, nav, prerender, FAQ.
- **F4 QA** — Q critique resolved, vitest/tsc/lint/build, axe 0 violations, no overflow at 320–1440,
  screenshots at 1440/768/375.

The contract for all agents is `docs/runs/family-planner/FAMILY-PLANNER-CONTRACT.md`.
