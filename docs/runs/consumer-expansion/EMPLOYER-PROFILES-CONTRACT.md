# F7 — Named employer work-calendar presets (draft foundation)

**Workstream:** C (calendars) / P (policy integration)  
**Branch:** `gapless/expansion-employer-profiles-20261102`  
**Release status:** Draft only; not integrated into consumer UI, not merged or deployed.

## Contract

`src/personal/employerProfiles.ts` adds a bounded, versioned local-only collection of up to 12 named employer work-calendar presets. Each preset carries the existing canonical `EmployerCalendar` (country/region, observed-holiday exclusions, custom employer holidays), a Monday–Sunday workweek, optional alternating-Friday anchor, date-only blackouts and a recurring planning-year start. It **does not** create another holiday calculation engine.

The new `gapless.employer.profiles.v1` storage key holds **named presets only**. The existing `gapless.employer.v1:<scope>` key remains the active calendar used by old URLs and current planner state. Saving, reading, removing or applying a named preset never overwrites that legacy active calendar. No migration runs automatically; any future migration must be opt-in and idempotent.

`resolveEmployerWorkProfile(profile, overrides)` is pure: explicit plan overrides take precedence only for the opened plan, must match the saved country/region, and never persist back to storage. This is a contract for future UI integration, **not** a new share-link encoder. Preset names, private blackouts and work calendars must not be copied into public URLs or analytics. Existing URL state and solver behavior are unchanged.

Invalid dates, missing anchors, impossible annual reset dates, cross-region overrides, duplicate IDs, malformed JSON, oversized collections and unavailable localStorage fail closed. Feb 29 is deliberately not accepted as a recurring planning-year reset until an explicit non-leap-year policy is specified.

## Verification and outstanding acceptance gates

- Pure-domain tests cover round trips, updates/deletion, jurisdiction isolation, date bounds, annual resets, alternating Fridays, legacy storage preservation, URL-plan override precedence, malicious data and unavailable storage.
- Exact-head CI must verify consumer tests, typecheck, lint, build and existing browser/visual workflow.
- This foundation changes no rendered view, so 1440/768/375/320 **feature screenshots are not yet available**; they are required when the UI is connected.
- Independent critic review, responsive UX integration, cross-feature forecast/solver reuse, a READY exact-head Vercel preview and the prior UX completion handoff are all **outstanding**. Do not merge this PR until release gates are met.
- Future UI work should explicitly migrate/activate named presets without adding a second active calendar source of truth or leaking names and blackouts to public share links.
