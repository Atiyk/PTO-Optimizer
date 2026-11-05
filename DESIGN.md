---
name: Gapless PTO Optimizer
description: The line, in Ink & Signal Blue. A break is one unbroken stretch of line through the calendar; Ink for reading, Signal Blue for actions, selection and PTO days, Sea Glass Teal for holidays and other time-off context, neutrals everywhere else.
colors:
  bg-page: "#f8fafc"
  bg-surface: "#ffffff"
  bg-surface-alt: "#f1f4f6"
  weekend-bg: "#f1f4f6"
  border-default: "#dce3ea"
  border-strong: "#75838f"
  text-primary: "#1b2935"
  text-muted: "#536575"
  accent: "#245da6"
  accent-hover: "#1d4c88"
  accent-pressed: "#173d6e"
  accent-soft: "#e9f1fb"
  band: "#e9f1fb"
  band-strong: "#d4e3f6"
  holiday: "#176a70"
  holiday-soft: "#e5f3f0"
  success: "#24704c"
  warning: "#9a5b0d"
  error: "#b93838"
  logo-bridge: "#8fd6ca"
typography:
  display:
    fontFamily: "'Archivo Variable', 'Archivo Fallback', ui-sans-serif, system-ui, sans-serif"
    fontWeight: 760
    fontStretch: "88%"
    letterSpacing: "-0.022em"
  body:
    fontFamily: "'Archivo Variable', 'Archivo Fallback', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
    fontFeature: "'tnum'"
rounded:
  control: "6px"
  sheet: "10px"
  run-end: "8px"
  pill: "9999px"
spacing:
  gutter-phone: "16px"
  gutter: "24px"
  container: "1280px"
components:
  button-primary: { backgroundColor: "{colors.accent}", textColor: "#ffffff", rounded: "{rounded.control}", height: "44px" }
  button-secondary: { backgroundColor: "{colors.bg-surface}", textColor: "{colors.text-primary}", border: "1px {colors.border-strong}", rounded: "{rounded.control}", height: "44px" }
  day-pto: { backgroundColor: "{colors.accent}", textColor: "#ffffff", rounded: "{rounded.control}", height: "48px" }
  day-run: { backgroundColor: "{colors.band}", textColor: "{colors.text-primary}", borderBottom: "3px {colors.accent}", rounded: "{rounded.run-end}" }
  plan-mode-tab: { activeBackground: "{colors.accent-soft}", activeText: "{colors.accent-hover}", rounded: "{rounded.pill}", height: "44px" }
  nav-tab-bar: { backgroundColor: "{colors.bg-surface}", activeIndicator: "3px {colors.accent}", height: "56px" }
  footer: { backgroundColor: "{colors.text-primary}", textColor: "#ffffff" }
---

# Design System: Gapless PTO Optimizer

Supersedes "The Highlighted Schedule" (2026-11 redesign, PR #114). The owner judged the
highlighter treatment amateurish; this world replaces it wholesale. Brand rationale and logo
process: `docs/BRAND-IDENTITY.md`.

## Overview

**North star: "The line."** The product's one idea is that a few PTO days join weekends and
holidays into one unbroken stretch. The system draws exactly that: on every calendar a break
is a continuous soft-blue run with a 3px Signal Blue rule along its bottom edge, PTO days are
solid blue stations on it, and the logo is a G whose gap has been filled in.

It is an Operate product first (planner, My PTO) with one Persuade surface (the landing page)
and Read surfaces (Learn, FAQ). Brand lives in precise details, never in decoration: one action hue plus one context hue,
one type family, no fills behind text, no gradients, no shadows at rest.

## Colors

Ink & Signal Blue (2026-11, replacing Line indigo, which the owner found too close to the
generic AI-SaaS purple). Predominantly neutral; blue and teal each have one job.

- **Ink** `#1b2935`: reading text, headings, key figures, the footer field.
- **Signal Blue** `#245da6` (`--accent`, `--pto-bg`): primary buttons, focus rings, the
  current location (rule, icon, text), selected controls, PTO days, break badges, the logo
  tile. Hover `#1d4c88`, pressed `#173d6e`.
- **Soft blue** `#e9f1fb` (`--band-bg`, `--mark`, `--accent-soft`): a recommended break's run
  (with a 3px Signal Blue rule along its bottom), selected chips, the active plan-mode pill.
- **Sea Glass Teal** `#176a70` on **soft teal** `#e5f3f0` (`--holiday-*`): public holidays
  (round marker) and employer days off (square marker). Never an action, never success.
- **Feedback**, separate from the brand roles: success `#24704c`, warning `#9a5b0d` (expiry,
  caps), error `#b93838` (validation), each with a soft background; disabled text `#9aa6b2`.
- **Neutrals**: canvas `#f8fafc`, surface `#ffffff`, secondary `#f1f4f6` (also weekends),
  border `#dce3ea`, control edge `#75838f`, secondary text `#536575`.

Calendar states: weekday plain; weekend secondary grey; holiday teal fill and marker; PTO
solid blue (pinned adds a pin glyph, unpaid adds its glyph); recommended run soft blue plus
rule; alternative dashed blue outline; blackout neutral hatching plus label; out of range
faded and disabled; today an ink ring. A holiday inside a run keeps the run and turns its
numeral and marker teal. Every state is a shape or word as well as a colour.

Rules: no gradients except the blackout hatch; no tinted section backgrounds; every pair is
contrast-tested from `src/index.css` by `tokens.test.ts` and `colorScheme.test.ts`. Dark mode
is not supported yet (`color-scheme: light`); when it is, it gets its own semantic values.

## Typography

One family, Archivo variable (self-hosted, wdth 75-100, wght 400-800).
- Display and figures (`.type-display`): 88% width, weight 760, -0.022em tracking.
- Section titles (`.type-condensed`): 92% width.
- Body and UI: normal width, 400-600, tabular figures everywhere.
- Emphasis inside a sentence (`.mark`, e.g. "9 days off"): weight 700 in ink. Never a fill,
  swipe, underline or colour behind text.
- Sentence case everywhere; no tracked caps; nothing under 12px.

## Shape and depth

6px controls, chips and day cells; 10px sheets and callouts; 8px run ends; full pills only for
the plan-mode switch. Flat at rest: hairlines and tone steps. Shadows only on floating things
(tooltips, menus, the touch action sheet, dialogs).

## Navigation and information architecture

Three destinations, named by intent:
- **Plan** (`/pto`, `/family`, `/sabbatical`): three ways of planning, switched by the
  "Ways to plan" pill row (Time off, Family, Sabbatical) that appears on those routes at every
  width. "Plan" is the current destination on all three.
- **My PTO** (`/policy`): balance forecast, expiry, requests, payout.
- **Learn** (`/glossary`, guides).

Desktop: white bar, lockup left, three links right; the current one has a 3px Signal Blue rule on
the header's bottom edge. Below 1024px: the same bar with the lockup only, plus a fixed bottom
tab bar with the three destinations (56px plus safe area, blue icon, label and top indicator on the
current tab). `index.css` reserves the bar's height. No menus to open.

The landing page lists the same structure as two groups of tappable rows ("Plan" and "Keep it
on track"), so the homepage and the header describe one product.

## Logo

The bridged G: a square-cut G of straight route segments whose top-right gap is filled by a
sea glass block (`src/ui/logoMark.ts`, one source for the header, footer, favicons, app icons,
OG images and the portrait share card). Lockup: mark + "gapless" (lowercase via CSS, accessible
name stays "Gapless PTO Optimizer") + "PTO Optimizer" in graphite. Dark tone for ink grounds.
Static assets: `public/favicon.svg`, `public/favicon.ico`, `public/apple-touch-icon.png`,
`public/icons/*`, `public/brand/*.svg`. Regenerate with `scripts/build-icons.ts`.

## Motion

150ms custom ease-out for hover and press (buttons sink to 0.97), 160ms when a figure changes,
nothing on load, all of it off under `prefers-reduced-motion`.

## Do and don't

- Do put Signal Blue only on actions, selection, PTO days, the current location and the brand,
  and teal only on holidays and time-off context.
- Do mark the data with type weight, not decoration.
- Don't reintroduce a highlighter, marker swipe, fluorescent accent, gradient text or a fill
  behind words.
- Don't add a fourth top-level destination without removing one; new planning modes join the
  "Ways to plan" row.
- Don't add shadows to things that do not float, or nest cards.
