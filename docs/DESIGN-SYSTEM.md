# Gapless design system (consumer app, 2026-11 redesign)

Direction: **the highlighted schedule.** A printed schedule gone over with a highlighter: crisp
ink on paper, one fluorescent marker for the time that is yours. The plan is literally the
marked run of days. Source of truth for values is `src/index.css`; this file explains the rules.

## Colour (restrained: ink, paper, one marker)

| Token | Value | Job |
|---|---|---|
| `--bg-page` / `bg-page` | `#f4f4f0` | The page: neutral off-white. Never cream. |
| `--bg-surface` / `bg-surface` | `#ffffff` | The sheet: panels, the calendar, inputs. |
| `--bg-surface-alt` / `bg-surface-alt` | `#eaeae4` | One tone step down: quiet panels, chips, hover. |
| `--border-default` / `border-line` | `#dcdcd5` | Sheet edges, row rules. |
| `--border-strong` / `border-line-strong` | `#86867e` | Control boundaries (3:1). |
| `--text-primary` / `text-ink` | `#141414` | All running text, headings, primary numerals. |
| `--text-muted` / `text-muted` | `#56564f` | Secondary text (≥4.5:1 on every surface). |
| `--accent` / `bg-accent` | `#141414` | **Ink is the action colour.** Primary buttons, PTO days. |
| `--mark` / `bg-mark` | `#dcf763` | **The marker.** Days-off runs, the plan result, active nav, selection, hover on primary. |
| `--mark-strong` | `#c9e83d` | A second marker pass (hover on something already marked). |
| `--accent-soft` | `#f1fbc4` | A pale marker pass: selected chips, plan findings. |
| `--pto-bg` | `#141414` | Suggested PTO day: solid ink block, white numeral. |
| `--band-bg` | `#dcf763` | The days-off run behind weekends and holidays. |

Rules
- No other hue. No teal, no orange, no blue links, no red except a genuine error (use ink plus
  an icon and words; if a red is truly needed, `#b42318` on white, 6.1:1).
- The marker never carries text that is lighter than ink, and never sits on ink except in the
  footer close and the logo.
- State is never colour alone: PTO = solid ink block; days off = marker run; holiday = ring/dot
  plus label; pinned = pin glyph; alternative = dashed ink outline.

## Type: Archivo (one variable family, width axis)

Self-hosted `public/fonts/archivo-latin-var.woff2` (~47 KB, wdth 75-100, wght 400-800).

| Use | Class | Spec |
|---|---|---|
| Display (landing h1, footer name) | `text-display type-display` | clamp 44-88px, condensed 75%, 800, leading .95 |
| Big figures (result, stat) | `text-display-sm type-display` | clamp 36-60px |
| Page title (app screens) | `text-h1 type-display` | clamp 28-40px |
| Section heading | `text-h2 font-bold type-condensed` | 24px |
| Body | default | 16px / 24px, normal width |
| Small / meta | `text-sm` | 14px; nothing under 12px |

Rules: tabular figures everywhere (body default). Sentence case. No tracked uppercase labels,
no eyebrows above headings, no monospace, no italic or coloured accent words in headlines.
Headings at most two lines (`text-wrap: balance` is global).

## Shape, space, depth

- Corners: square, `rounded-[3px]` for buttons/inputs/chips, `rounded-[4px]` for panels.
  Never `rounded-full` pills for buttons, never 12-24px soft cards.
- Depth: tone steps and hairlines. No shadow at rest; only floating things (menus, popovers,
  dialogs, the phone tab bar's top edge) may have one.
- Layout: `Container` max 1280px, gutters 16px (phone) / 24px (sm+). Section gap ≥ 64px on
  desktop app screens, 96-160px on the landing page. More space above a heading than below.
- Touch targets ≥ 44px (`min-h-11`).

## Components (src/ui)

- `Button`: primary = solid ink, hover = marker with ink text, press scale .97; secondary =
  1px ink outline on white; quiet = underlined text, marker on hover. One primary per view.
- `Card`: white sheet, 1px `border-line`, 4px corners, no shadow. Do not nest cards; inside a
  card use tone steps or rules.
- `Chip`: square label; `tone="accent"` = marker fill.
- `Callout`: tone-step note; plan findings get `accent-soft` and a small ink square.
- `StatNumber`: condensed heavy figure + small label.
- `.mark` (CSS): marker swipe behind inline text, e.g. `<span className="mark">27 days off</span>`.
- `.link-mark` (CSS): underlined link whose marker fills on hover - use for inline text links.
- `SiteHeader`: lg+ plain bar (wordmark, Sabbatical / My PTO / Learn, primary Plan PTO; active =
  marker stroke under label). Below lg: wordmark only on top, **fixed bottom tab bar** with four
  destinations (56px + safe area). `body` reserves its height below lg; anything sticky at the
  bottom of a page must sit above `bottom: calc(3.5rem + env(safe-area-inset-bottom))` below lg.
- `Footer`: the one drenched ink field; name at full width over a marker stroke.

## Calendar (the signature)

- PTO day: solid ink cell, white numeral, square.
- Days-off run: marker fill on the cells; adjacent cells in one run should read as one
  continuous stroke (no gaps between them in the run, rounded only at the run's ends).
- Holiday: small ink ring/dot under the numeral, plus its name in the tooltip/label.
- Pinned: ink cell with pin glyph. Alternative: 1px dashed ink outline. Today: 2px ink outline.

## Motion

Custom curves: `--ease-out: cubic-bezier(.23,1,.32,1)`. Buttons 150ms, hovers 150-180ms, popovers
≤200ms. Nothing animates on page load; nothing animates on slider drags or keyboard input; a
changed figure eases in once (`StatNumber`). `prefers-reduced-motion` turns it all off.

## Accessibility conventions

WCAG 2.2 AA enforced by `src/ui/tokens.test.ts` and `colorScheme.test.ts`. Ink focus ring 2px,
offset 2px (marker ring on the ink footer). Every control labelled; `aria-current` on nav.

## Skill sources and where they disagreed

- Impeccable (direction, craft floor): replaced the cream/teal "calm premium" look as an AI
  default; required a direction roll, contract and finish review.
- Taste skill (design-taste-frontend): no eyebrows, no tracked caps, no gradients or resting
  shadows, square-or-pill buttons decided once, footer as a designed close, name at full width;
  app-screen rules allow hairline borders and small labels in working screens.
- Emil design engineering: custom ease-out curves, press feedback, never animate keyboard or
  high-frequency actions (slider drags), sub-300ms UI motion.
- Conflict resolved: impeccable's marker-on-headline instinct vs taste's "no styled accent word
  in a headline" - the marker goes on data (results, runs), never on headline words.
- Conflict resolved: taste bans thin rules on pages; app screens keep hairlines (taste's own
  app-screen exception). Landing sections separate by space and tone, not rules.
