# Consumer regression matrix

This run changes the consumer Gapless application only. `apps/teams`, its routes, backend,
database, configuration, and deployment are outside scope. The root Vitest configuration
excludes `apps/**`; passing it is not a claim that B2B has been tested.

An automated test is evidence for its asserted behavior only. The matrix below records
the required scenarios and where evidence belongs; a row remains pending until the
integrated implementation and its actual test output have been reviewed.

| # | Scenario | Required assertion | Evidence / initial status |
|---|---|---|---|
| 1 | Default US plan, 15 PTO days | Unique PTO cost stays within effective budget and results are deterministic | Existing `packages/engine/src/solver/solve.test.ts`; integrated run pending |
| 2 | Unobserved public holiday | Deselecting a weekday holiday makes it a working date and recalculates PTO cost | `src/ui/employerCalendarIntegration.test.tsx`: passed; browser flow pending |
| 3 | Saved employer calendar | Country/region-specific settings survive reload; another region remains independent | Employer hook integration: passed for refresh/country/subdivision; browser reload pending |
| 4 | Shared employer override | Explicit URL edits override local preferences without writing them into local storage | Employer hook integration: passed; shared default outranks saved exclusions and editing does not overwrite storage |
| 5 | Minimum five-day break | Candidate eligibility changes before selection; no returned optional break silently violates the minimum | Consumer-planner regression checks pending |
| 6 | Blackout collision | A mandatory work date is never purchased as PTO | Existing solver regression checks; integrated run pending |
| 7 | Accrual limitations | Cumulative PTO consumption never exceeds the balance available on that date | Existing solver and policy projection checks; integrated run pending |
| 8 | Carryover / expiration | At-risk amount matches configured cap/reset; full carryover has no false forfeiture | Existing `src/policy/acceptance.test.ts`, projection tests; new guard checks pending |
| 9 | Forecast date | Changing the target changes ending balance consistently with the existing policy projection | Forecast checks pending |
| 10 | Request status | Planned → requested → approved moves one unique future deduction between scenarios | Ledger transition and forecast checks pending |
| 11 | Rejected/canceled request | Inactive requests reserve no confirmed or tentative future PTO | Ledger checks pending |
| 12 | Duplicate/overlap | Overlapping working dates deduct once; UI identifies the conflict | Ledger and tracker checks pending |
| 13 | Partner availability | Joint suggestions respect both disclosed calendars and independent PTO constraints | Partner-planner checks pending |
| 14 | Share privacy | Default link contains availability only, excluding balances, notes, employer, and policy | Existing overlap URL checks plus new partner checks pending |
| 15 | Portrait PNG | Canvas is 1080×1350; dates/costs match current plan; default pixels omit balance | Portrait renderer tests and visual review pending |
| 16 | Legacy URLs | Old `w`, `count`, `ov`, policy and date parameters continue to decode and reproduce valid plans | Existing `src/ui/urlState.test.ts`, `policyUrlState.test.ts`; integrated run pending |
| 17 | Mobile | All main flows at 375px have no page overflow/clipped controls | `scripts/consumer-qa.mjs`; browser initially unavailable |
| 18 | Keyboard/accessibility | Inputs have names; menu opens with Enter/closes with Escape and restores focus; controls remain reachable | Existing component tests + browser smoke; browser initially unavailable |
| 19 | Storage unavailable | Read/write/security/quota failures never crash planning; failed save is accurately reported | Employer hook storage-failure check passed; tracker failure checks pending |
| 20 | Invalid/missing data | Malformed dates, oversized payloads, impossible constraints, and missing holidays degrade honestly | Existing URL/holiday checks plus new module checks pending |

## Browser evidence

Employer-calendar hook integration was run against the real short-range consumer solver
and mocked holiday loaders: 7/7 tests passed (251 ms test execution, 1.91 s total).
Consumer TypeScript checking and targeted lint for the new test/script also passed.
These results apply to the employer-calendar phase snapshot, not future integrated phases.

Run the existing consumer Vite server, then:

```sh
node scripts/consumer-qa.mjs http://127.0.0.1:5173 /absolute/path/to/evidence before
node scripts/consumer-qa.mjs http://127.0.0.1:5173 /absolute/path/to/evidence after
```

The script creates fresh browser contexts at 1440px, 768px, and 375px for `/`, `/pto`,
`/policy`, and `/sabbatical`, plus screenshots of expanded PTO options. It uses committed
same-origin holiday data, a fixed November 2, 2026 clock, US locale, New York timezone,
and reduced motion. Reports record page errors, same-origin HTTP failures, page overflow,
heading/label checks, and a keyboard/menu smoke check. Third-party analytics is blocked
in these evidence contexts. Vercel's platform-only Insights script is stubbed because
the local static server cannot serve it; other same-origin failures remain failures.
Directory routes use a trailing slash for Vite preview, and route-specific title checks
prevent its homepage fallback from being mistaken for an optimizer/policy/sabbatical
test. No signed-in or B2B actions run.

These are basic browser checks, not a WCAG conformance audit or Lighthouse measurement.
Lighthouse accessibility, SEO, and performance scores must be reported separately.

## Baseline environment limitations

The initial environment has no installed Chromium executable. Both `npx playwright install
chromium` and `npx playwright install chromium --only-shell` failed after five retries:
the download was reported as 0 MiB and extraction failed with “End of central directory
record signature not found.” Baseline screenshots at the requested exact viewports,
local browser flows, and Lighthouse scores are unavailable until a usable local browser
is supplied. A missing browser produces a report
with `status: "unavailable"` and exit code 2; it does not count as a successful check.

Cloud-browser baseline evidence was captured from the verified production consumer
deployment at commit `4a0a10de0075d0d9be4987ad02a6cc0326ba1758`. Its observed viewport
was 1363×936; the supported cloud API exposes no resize control, so these images are
desktop evidence only, not substitutes for the 1440/768/375 matrix. The home image is
full-page; optimizer, policy, and sabbatical images show their initial viewport.
Files: `/workspace/scratch/gapless-baseline-home.jpg`,
`/workspace/scratch/gapless-baseline-pto.jpg`,
`/workspace/scratch/gapless-baseline-policy.jpg`, and
`/workspace/scratch/gapless-baseline-sabbatical-verified.jpg`.

An existing semantic defect was observed on `/sabbatical`: no `h1` is present in the
rendered DOM. The page's lead result is visually prominent but uses a different element.
This must be distinguished from a newly introduced regression. Cloud console errors
observed during the baseline were from a browser extension, not application source.

## Scope review before release

- Compare changed paths against the consumer scope and reject any `apps/teams/**` edit.
- Review any shared-engine change separately for opt-in behavior and legacy compatibility.
- Check private ledger data stays in validated local browser storage and out of URL state.
- Confirm analytics contains event names only, without personal event properties.
- Confirm every new planning control round-trips, using versioned bounded URL payloads.
- Record real tests, type checks, lint, production build, deployment, and runtime status.
- Do not mark pending browser or production verification as passed.
