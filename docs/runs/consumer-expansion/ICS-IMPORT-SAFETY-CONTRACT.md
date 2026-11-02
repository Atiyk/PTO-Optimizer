# Consumer expansion — local ICS import safety gate (F8/F9)

**Status:** isolated draft, not released. Branch `gapless/expansion-ics-import-safety-20261102` starts from consumer main `3187596230768e4818720d1907475c9a3341a54c`. The preceding UX automation is enabled and explicitly unfinished; **release Gate 0 remains closed**. The owner's November 2 exception permits non-overlapping draft code and tests only.

## Why this is needed

The existing shared local ICS parser is used by personal busy-day imports and is the planned input for the F8 school calendar and F9 conflict checker. Previously it unfolded arbitrarily large strings and expanded potentially decades-long all-day ranges before checking bounds. An adversarial or malformed local file could freeze the browser or produce misleading incomplete dates.

## Changes

- Keep the **single canonical** `src/ui/icsImport.ts` parser. No second school ICS parser, network request, database, upload, or third-party dependency.
- Reject input longer than **1,000,000 JavaScript characters** before line unfolding. The caller should also cap the file before `file.text()` for memory safety; that UI integration is not included.
- Require a complete `BEGIN:VCALENDAR` / `END:VCALENDAR` envelope and closed VEVENTs.
- Reject invalid Gregorian dates, invalid times, malformed suffixes, backwards ranges, excessive event spans (over 3,660 days) and imports exceeding **4,000 distinct busy dates**.
- Preserve the existing **500-event truncation indicator**, explicit skipped-recurring count, exclusive all-day DTEND, short timed-meeting exclusion, and date-only private outputs.
- Errors are generic; no private calendar titles, names, attendee information, salaries, employer details or event content appear in exception messages or URLs.

## Explicit limitations and QA

- Timed event TZID/UTC offsets and DST elapsed-hour differences remain simplified in the existing parser. Do **not** advertise reliable sub-day timezone interpretation. All-day DATE school breaks across DST are handled as local date-only spans.
- RRULE remains unsupported and is disclosed as skipped; do not imply full calendar coverage.
- This PR hardens a **foundation**, not a school import UI, conflict indicator or complete school calendar. Feature-specific screenshots at 1440/768/375/320 and keyboard/visual QA must occur during integration.
- Independent critic must check file-size limits, extreme span behavior, ordinary export compatibility, timezone caveat, privacy, and that no UI silently converts parse failures to an empty calendar.
- Run exact-head consumer Vitest, TypeScript, lint, build, browser QA, Lighthouse and accessibility checks. Do not merge until independent review, preceding UX completion, required Vercel preview and production SHA gates pass.

**Ownership:** Agent C (calendar/scheduling) implementation, executed sequentially by the orchestrator; independent Q critic is **not** claimed. No UX-owned PR files, B2B `apps/teams`, shared engine, URLs, analytics or storage changed.
