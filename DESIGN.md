---
name: Gapless PTO Optimizer
description: The line. A break is one unbroken stretch of line through the calendar; ink for reading, Line indigo for every action, PTO day and the brand, a soft pass of the same indigo for the days off it joins.
colors:
  bg-page: "#f5f6f8"
  bg-surface: "#ffffff"
  bg-surface-alt: "#eceef2"
  weekend-bg: "#eef0f3"
  border-default: "#dde0e6"
  border-strong: "#80869a"
  text-primary: "#12141c"
  text-muted: "#535968"
  accent: "#3a36d0"
  accent-hover: "#2c28ad"
  accent-soft: "#efeefd"
  band: "#e3e2fb"
  band-strong: "#cfcdf7"
  logo-bridge: "#8c89f5"
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
  button-secondary: { backgroundColor: "{colors.bg-surface}", textColor: "{colors.text-primary}", border: "1px {colors.text-primary}", rounded: "{rounded.control}", height: "44px" }
  day-pto: { backgroundColor: "{colors.accent}", textColor: "#ffffff", rounded: "{rounded.control}", height: "48px" }
  day-run: { backgroundColor: "{colors.band}", textColor: "{colors.text-primary}", borderBottom: "3px {colors.accent}", rounded: "{rounded.run-end}" }
  plan-mode-tab: { activeBackground: "{colors.text-primary}", activeText: "#ffffff", rounded: "{rounded.pill}", height: "44px" }
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
is a continuous soft-indigo run with a 3px Line-indigo rule along its bottom edge, PTO days are
solid indigo stations on it, and the logo is a G whose gap has been filled in.

It is an Operate product first (planner, My PTO) with one Persuade surface (the landing page)
and Read surfaces (Learn, FAQ). Brand lives in precise details, never in decoration: one hue,
one type family, no fills behind text, no gradients, no shadows at rest.

## Colors

- **Ink** `#12141c`: all reading text, headings, secondary-button outlines, the active plan-mode
  pill, the footer field.
- **Line indigo** `#3a36d0` (`--accent`, `--pto-bg`): primary buttons, every PTO day, break
  number badges, the active-navigation indicator, focus rings, slider and checkbox tint, the
  logo tile. Hover `#2c28ad`.
- **Run tint** `#e3e2fb` (`--band-bg`, `--mark`): the days off inside a break, selected chips,
  "together" days on /family, sabbatical chart bars. Hover pass `#cfcdf7`.
- **Pale pass** `#efeefd` (`--accent-soft`): finding callouts.
- **Neutrals**: cool paper `#f5f6f8`, sheet `#ffffff`, tone `#eceef2`, weekend `#eef0f3`,
  hairline `#dde0e6`, control edge `#80869a`, graphite text `#535968`.

Rules: no second hue. State is never colour alone (PTO = solid block, holiday = dot plus name,
pinned = pin glyph, alternative = dashed outline). Every token pair is contrast-tested from
`src/index.css` by `tokens.test.ts` and `colorScheme.test.ts`.

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

Desktop: white bar, lockup left, three links right; the current one has a 3px indigo rule on
the header's bottom edge. Below 1024px: the same bar with the lockup only, plus a fixed bottom
tab bar with the three destinations (56px plus safe area, indigo icon and top indicator on the
current tab). `index.css` reserves the bar's height. No menus to open.

The landing page lists the same structure as two groups of tappable rows ("Plan" and "Keep it
on track"), so the homepage and the header describe one product.

## Logo

The bridged G (`src/ui/logoMark.ts`, one source for the header, footer, favicons, app icons,
OG images and the portrait share card). Lockup: mark + "gapless" (lowercase via CSS, accessible
name stays "Gapless PTO Optimizer") + "PTO Optimizer" in graphite. Dark tone for ink grounds.
Static assets: `public/favicon.svg`, `public/favicon.ico`, `public/apple-touch-icon.png`,
`public/icons/*`, `public/brand/*.svg`. Regenerate with `scripts/build-icons.ts`.

## Motion

150ms custom ease-out for hover and press (buttons sink to 0.97), 160ms when a figure changes,
nothing on load, all of it off under `prefers-reduced-motion`.

## Do and don't

- Do put the indigo only on actions, PTO days, the current location and the brand.
- Do mark the data with type weight, not decoration.
- Don't reintroduce a highlighter, marker swipe, fluorescent accent, gradient text or a fill
  behind words.
- Don't add a fourth top-level destination without removing one; new planning modes join the
  "Ways to plan" row.
- Don't add shadows to things that do not float, or nest cards.
