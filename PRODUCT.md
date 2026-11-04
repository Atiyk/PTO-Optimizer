# Product

<!-- impeccable:product-schema 1 -->

> Scope: the consumer Gapless PTO Optimizer at the repo root (`src/`, `index.html`, country
> folders). Not `apps/teams` (B2B Gapless), which has its own product truth.
>
> Provenance: written 2026-11-04 during the autonomous consumer redesign. The owner's brief
> told the run not to ask design or product questions, so every fact below is inferred from
> the repository (root `CLAUDE.md`, `docs/REDESIGN-SPEC.md`, `docs/CONSUMER-IMPLEMENTATION-STATUS.md`,
> shipped code) rather than from an interview. Items marked *(inferred)* are reasonable
> readings, not owner confirmations.

## Platform

web

## Users

Salaried, white-collar employees with a PTO allowance (typically 10 to 30 days) who want their
time off to go further. They arrive in short bursts: when a new year's holidays are published,
when a balance is about to expire, when a partner asks "when can we go away?", or when they
need to submit a request to a manager. They are not HR professionals and read policy language
reluctantly. Secondary: people planning a sabbatical, and couples coordinating leave.
*(inferred from REDESIGN-SPEC §0 and shipped features)*

## Product Purpose

Turn a PTO allowance plus a country's public holidays into the longest, best-placed breaks,
instantly and for free, then help the user keep that plan true over the year: track requests,
forecast the balance, avoid expiry, coordinate with a partner, and share the plan.

Success: a visitor sees a concrete, personal plan (dates, PTO cost, calendar days off) within
seconds, trusts the number, and leaves with it on their calendar or in a request.

## Positioning

A deterministic optimizer, not a list of "long weekend ideas". Every input lives in the URL, so
any plan reproduces exactly from a link; results update live with no submit step; the engine is
the same tested code for every number. It owns non-work time and does not compete with work-task
planners.

## Operating Context

- Live recomputation on every input change (no submit, no "Generate", no multi-step forms).
- Free-form date pickers; every planning control round-trips through the URL.
- Prerendered static HTML per route for SEO (`scripts/routes.ts`): `/`, `/pto`, `/sabbatical`,
  `/policy`, `/glossary` (+ one page per term), `/faq`, `/data-sources`, six country routes,
  privacy and terms.
- Personal data (tracked requests, saved employer calendars, policy) stays in the browser.
- Hosted on Vercel's free tier; each push to a PR branch can consume a preview build.

## Capabilities and Constraints

Shipped and must survive any redesign:
- `/pto` planner: country, date range, PTO budget, "what matters more" tradeoff slider and
  break-count slider (both always visible), planning style presets, More options (workweek,
  employer holidays, blackout and must-include dates, notice period, reserve, minimum break,
  peak cap), click-to-pin calendar with alternatives, top-three breaks, "Why this plan?",
  pinned plans, ICS export, image copy, link copy, portrait share card, request text, partner
  planning and overlap, request tracker.
- `/policy`: quick balance forecast, policy model, expiration guard with ICS reminders,
  departure payout scenario, request tracker, advanced policy explanation.
- `/sabbatical`: placement search, marginal value of added PTO days, calendar, export.
- `/glossary` learning hub and guides, `/faq`, data sources.
- The engine (`packages/engine`, `src/planning`, `src/policy`, `src/personal`) is frozen for
  UI work. Old URLs and params must keep working.

## Brand Commitments

- Name: **Gapless PTO Optimizer**; short form **Gapless** (one constant, `src/brand.ts`).
- Voice: plain, specific, numerical, calm; never hype, never legal advice.
- Accounts are optional; every result works signed out.

## Evidence on Hand

Real public-holiday data (Nager.Date), real engine output, TSA passenger-volume data for
"busy travel" weighting. No testimonials, user counts, press, or ratings exist; do not invent
any.

## Product Principles

1. The plan is the hero: show a real, personal result before asking for anything.
2. Every number is traceable to the engine and reproducible from the link.
3. Depth without clutter: advanced controls stay reachable, never hidden behind a submit step.
4. Private by default: nothing leaves the browser unless the user shares it.

## Accessibility & Inclusion

WCAG 2.2 AA: 4.5:1 text contrast (3:1 for large text and UI boundaries) enforced by
`tokens.test.ts` / `colorScheme.test.ts`; state never by colour alone; full keyboard support;
44px touch targets; `prefers-reduced-motion` honoured.
