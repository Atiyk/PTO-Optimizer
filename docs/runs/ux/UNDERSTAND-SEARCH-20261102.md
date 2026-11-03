# Consumer UX — Understand search-first interaction

**Date:** 2026-11-02  
**Branch:** `gapless/ux-understand-search-first-20261102`  
**Scope:** Consumer `/glossary` only. No changes to `apps/teams`, the solver, employer calendars, policy math, URL encoding or analytics.

## Problem found

The existing Understand hub places four learning-path cards, six practical-guide cards and a policy callout **above** the glossary search field. When a user types into that field, the alphabetized results far below update, but the large unfiltered sections remain above them. At narrow widths this makes live search appear unresponsive; screen-reader users receive no count or clear affordance.

## Implemented

- Move the search control immediately below the Understand introduction, above the pathways.
- Hide the unrelated pathways/guide cards/CTA **only while a nonblank search is active**, so results appear directly after the field. Restore all pathways and guides when the search is cleared.
- Normalize leading/trailing whitespace in matching so spaces alone do not trigger an empty-results state.
- Add a polite result-count status associated with the labelled native search input.
- Add a 44px-tall clear button, keyboard-focus restoration and a concise no-results message.
- Preserve all existing glossary routes, guide copy, search aliases and prerendered default content.
- Add three component tests and Playwright interaction/screenshot checks at 1440/768/375/320, including no horizontal overflow and focus return.

## Critic review checklist / merge gate

- Verify the default `/glossary` SSR HTML still includes the full pathways, guide cards and glossary links for crawlers and no-JS readers.
- Verify filtering matches term names, aliases and short definitions without inventing content.
- Verify keyboard search/clear focus, live result announcement, no-results and whitespace-only input.
- Verify mobile 320px search+clear controls do not cause overflow; inspect browser screenshots at 1440, 768, 375 and 320.
- Require exact-head consumer tests/typecheck/lint/build, browser/visual evidence, and independent critic signoff. Do not merge without a Vercel READY preview on the exact PR SHA.
- If Vercel quota blocks preview, **leave this PR draft** and continue isolated work; no claim of production release.

## Release queue coordination

Main production baseline last verified at `3187596230768e4818720d1907475c9a3341a54c`. PRs #87 (explanation), #88 (result-first landing), #90 (touch calendar) and #92 (recoverable constraints) are draft and pending coordinated preview/review/release. This change only touches `Glossary.tsx`, a new component test, this document, and `scripts/consumer-qa.mjs`; it does not touch `App.tsx` or `DayCell.tsx`. Coordinate the browser script with PRs #87/#88 during integration. Expansion PRs remain outside this UX release.

**Status:** implementation committed; CI, critic review, preview and merge are unverified until observed.
