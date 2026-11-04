---
name: Gapless PTO Optimizer
description: A printed schedule gone over with a highlighter; ink for every action and PTO day, one fluorescent marker for the time that is yours.
colors:
  bg-page: "#f4f4f0"
  bg-surface: "#ffffff"
  bg-surface-alt: "#eaeae4"
  weekend-bg: "#eeeee8"
  border-default: "#dcdcd5"
  border-strong: "#86867e"
  text-primary: "#141414"
  text-muted: "#56564f"
  mark: "#dcf763"
  mark-strong: "#c9e83d"
  accent-soft: "#f1fbc4"
typography:
  display:
    fontFamily: "'Archivo Variable', 'Archivo Fallback', ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 1rem + 5vw, 6rem)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 75"
  display-figure:
    fontFamily: "'Archivo Variable', 'Archivo Fallback', ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 1.5rem + 3vw, 3.75rem)"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 75"
  headline:
    fontFamily: "'Archivo Variable', 'Archivo Fallback', ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(1.75rem, 1.4rem + 1.4vw, 2.5rem)"
    fontWeight: 800
    lineHeight: 1.05
    letterSpacing: "-0.02em"
    fontVariation: "'wdth' 75"
  title:
    fontFamily: "'Archivo Variable', 'Archivo Fallback', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.15
    fontVariation: "'wdth' 82"
  body:
    fontFamily: "'Archivo Variable', 'Archivo Fallback', ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: "1.5rem"
    fontFeature: "'tnum'"
  label:
    fontFamily: "'Archivo Variable', 'Archivo Fallback', ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: "1.25rem"
    fontFeature: "'tnum'"
rounded:
  sm: "3px"
  md: "4px"
  dot: "9999px"
spacing:
  gutter-phone: "16px"
  gutter: "24px"
  sheet-pad: "20px"
  sheet-pad-lg: "24px"
  section-app: "32px"
  section-landing: "80px"
  section-landing-lg: "112px"
  container: "1280px"
components:
  button-primary:
    backgroundColor: "{colors.text-primary}"
    textColor: "{colors.bg-surface}"
    rounded: "{rounded.sm}"
    padding: "0 20px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "#3a3a35"
    textColor: "{colors.bg-surface}"
  button-secondary:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "0 20px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.bg-surface-alt}"
  button-quiet:
    textColor: "{colors.text-primary}"
    padding: "0 12px"
    height: "44px"
  button-sm:
    padding: "0 14px"
    height: "36px"
  card:
    backgroundColor: "{colors.bg-surface}"
    rounded: "{rounded.md}"
    padding: "{spacing.sheet-pad}"
  chip:
    backgroundColor: "{colors.bg-surface-alt}"
    textColor: "{colors.text-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: "4px 10px"
  chip-accent:
    backgroundColor: "{colors.mark}"
    textColor: "{colors.text-primary}"
  callout-finding:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  callout-note:
    backgroundColor: "{colors.bg-surface-alt}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
  select-ink:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "0 36px 0 12px"
    height: "44px"
  day-pto:
    backgroundColor: "{colors.text-primary}"
    textColor: "{colors.bg-surface}"
    rounded: "{rounded.sm}"
    height: "48px"
  day-run:
    backgroundColor: "{colors.mark}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    height: "48px"
  day-weekend:
    backgroundColor: "{colors.bg-surface-alt}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.sm}"
    height: "48px"
  nav-tab-bar:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.text-muted}"
    height: "56px"
  footer:
    backgroundColor: "{colors.text-primary}"
    textColor: "{colors.bg-surface}"
---

# Design System: Gapless PTO Optimizer

## Overview

**Creative North Star: "The Highlighted Schedule"**

Gapless is a printed schedule someone has gone over with a highlighter. The page is paper, everything you act on is ink, and one fluorescent marker swipes across the time that is yours: the days-off runs, the result figure, the active destination, selected text. The plan is literally the marked run of days, so the visual system and the product's output are the same object.

The world is flat and typographic. A white sheet sits on a neutral off-white page with a hairline edge and no shadow; depth comes from one tone step down, never from lift. One variable family (Archivo) does all the talking: condensed and heavy for headlines and figures, normal width for controls and reading. Every number is set in tabular figures because every number changes as inputs change. Density follows the job: the landing page breathes in large sections, the planner packs a control rail beside a dominant calendar.

The system was built to refuse the category default of a calm cream "wellness" planner with soft rounded cards and a teal accent. Corners are near-square, there is no second hue, and nothing animates on load.

**Key Characteristics:**
- Ink (#141414) is the action colour and the PTO colour; the marker (#dcf763) is reserved for your time and your results.
- No other hue exists anywhere in the consumer app.
- Archivo variable, one family: condensed 800 for display and figures, normal width for UI.
- Near-square corners (3px controls, 4px sheets); full rounding only on small dot indicators.
- Flat at rest: hairlines and tone steps, shadows only on things that float.
- Tabular figures everywhere; sentence case everywhere.

## Colors

Restrained to three materials: paper, ink, and one fluorescent marker, with a warm-grey pencil ramp between paper and ink.

### Primary
- **Ink** (text-primary): every primary action, every PTO day (a solid ink block with a white numeral), all running text and headings, focus rings, the caret, and the footer's drenched field. The token `--accent` is an alias of ink.

### Secondary
- **Highlighter Yellow-Green** (mark): the days-off run on every calendar, the inline marker swipe behind a result figure, the active desktop nav underline and the active tab-icon bar, accent chips, and `::selection`. Text on it is always ink.
- **Second Marker Pass** (mark-strong): a run that is being hovered or focused via its break card; "the same marker, gone over twice".
- **Pale Marker Pass** (accent-soft): the plan's own findings (finding callouts) and soft highlights.

### Neutral
- **Paper** (bg-page): the page itself; a neutral off-white, deliberately not cream.
- **Sheet** (bg-surface): cards, the calendar, inputs, the phone tab bar.
- **Sheet Tone** (bg-surface-alt): one tone step down; chips, quiet panels, hover fills, the landing "how it works" field, dry-spell shading on the year strip.
- **Weekend Tone** (weekend-bg): the weekend column in calendars.
- **Hairline** (border-default): sheet edges, month-heading rules, row rules.
- **Control Edge** (border-strong): input and select boundaries (3:1 against page, sheet and tone), year-strip baseline, scrollbar thumb.
- **Pencil** (text-muted): secondary text, weekend numerals, the holiday dot, inactive nav. Holds 4.5:1 on every surface.

The legacy Tailwind slate ramp is remapped onto these pencil neutrals in `src/index.css` (slate-50 #f7f7f4 through slate-950 #0a0a0a), so slate-400 and up pass 4.5:1 on every background.

### Named Rules
**The Ink Acts, the Marker Means Yours Rule.** Ink carries every action and every PTO day. The marker marks only days off, results, selection and "you are here"; it never fills a button, a header, or other chrome.

**The No Other Hue Rule.** There is no teal, blue, orange, green or red in the consumer app. State is never carried by colour alone: PTO is a solid ink block, days off are a marker run, a holiday is a dot plus its name, pinned is a pin glyph, unpaid is a ring glyph, an alternative is a dashed ink outline.

**The Contrast Is Tested Rule.** Every text/background token pair is parsed from `src/index.css` and checked by `tokens.test.ts` (4.5:1 for text, 3:1 for UI boundaries). A new colour token joins that check or does not ship.

## Typography

**Display Font:** Archivo Variable, condensed (width 75%) at weight 800 (with 'Archivo Fallback', a metric-adjusted Arial)
**Body Font:** Archivo Variable at normal width (same fallback)

**Character:** One family on a width axis. Squeezed and heavy, it reads like the headline of a timetable; at full width it is a plain, sturdy grotesque that disappears into the controls. Self-hosted Latin subset, wdth 75-100, wght 400-800.

### Hierarchy
- **Display** (800, condensed, clamp 2.5rem to 6rem, line-height 0.92): the landing h1 only, held to about 17ch.
- **Display Figure** (800, condensed, clamp 2.25rem to 3.75rem, stepping up to the 2.75rem to 5.5rem display token from 640px): the big engine figures in StatNumber and the large section statements. The landing result figure runs its own clamp (2.75rem to 4.75rem) with the marker swipe behind it.
- **Headline** (800, condensed, clamp 1.75rem to 2.5rem, line-height 1.05): page titles on app screens and landing section heads.
- **Title** (700, width 82%, 1.5rem, line-height 1.15): section and card headings, holiday dates in the timetable list. Month names in calendars use the same width at 1.125rem.
- **Body** (400, 1rem / 1.5rem): reading text and control values; `max-w-prose` or about 36-44rem measures in running copy. Lead paragraphs step to 1.125rem.
- **Label** (600, 0.875rem / 1.25rem): field labels, chips, captions, the "Why:" line. Meta text uses the same size at 400 in pencil. Nothing renders under 12px (tab-bar labels, weekday letters).

### Named Rules
**The Condensed Is For Headlines And Figures Rule.** The 75% width at 800 appears only in display lines, headings and numerals (and the wordmark). Controls, labels and reading text stay at normal width.

**The Tabular Everywhere Rule.** `font-variant-numeric: tabular-nums` is set on body; every figure, date column and counter inherits it so values never jitter sideways as they change.

**The Sentence Case Rule.** Headings, labels, buttons and captions are sentence case. No tracked uppercase labels.

## Layout

One content width: a centred container to 1280px with 16px gutters on phones and 24px from 640px up. Every section wraps its content in that container so left and right edges align at any viewport; full-bleed fields (the landing tone field, the footer) span the viewport behind it.

The landing page is a Persuade surface with generous rhythm: sections separate by space and tone, not rules, at 80px on phones and 112px from 1024px. The first screen sets the condensed h1 on the left, a live sentence form ("I have [15] PTO days in [country].") with inline fields at the sentence's own size, and the marked result in a 7:5 two-column grid; the full year schedule follows beneath at full width.

App screens are Operate surfaces: the planner uses a 300px sticky control rail beside a dominant calendar from 1024px, and section-to-section rhythm is a single 32px gap. Text measures cap at `max-w-prose`.

Below 1024px the desktop nav collapses to a wordmark-only top bar and a fixed bottom tab bar (56px plus safe area); `body` and `scroll-padding` reserve that height so nothing is covered. Touch targets are at least 44px everywhere, including inline sentence fields and calendar day cells (48px).

## Elevation & Depth

Flat by default. Depth is carried by tone steps (paper, sheet, sheet tone) and 1px hairlines. Shadows exist only on things that float above the page: hover tooltips, menus, popovers, the touch action sheet and dialogs. The marker swipe is drawn with an inset box-shadow, but that is a fill technique, not elevation.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)`): tooltips, menus, country-select listbox, info hints.
- **Sheet Float** (`box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)`): the touch action sheet and the keyboard-shortcuts dialog.

### Named Rules
**The Flat Sheet Rule.** Nothing casts a shadow at rest. If it does not float over other content, it gets a hairline or a tone step instead.

## Shapes

Near-square, printed geometry. Controls (buttons, inputs, selects, chips, day cells, tooltips) take a 3px corner; sheets, callouts, menus and the ends of a days-off run take 4px. A days-off run is drawn as one continuous marker band across its cells, rounded only at its two ends, with an ink hairline along its bottom edge like a ruled line under the highlight. Full rounding is reserved for small indicators: the holiday dot, the overlap dot and the info-hint ring. Icons are 1.75px-stroke outline drawings made for the product; the logo mark is an ink sheet crossed edge to edge by a marked row holding two ink day-blocks.

## Components

### Buttons
Flat, square and decided once.
- **Shape:** near-square (3px); 44px tall at md, 36px at sm.
- **Primary:** solid ink with white semibold label; one per view, always a link into a tool or a real action, never a submit.
- **Hover / Focus:** primary lifts to a softer ink (#3a3a35); secondary fills with sheet tone; every button sinks to scale 0.97 on press over 150ms (custom ease-out). Focus is a 2px ink outline offset 2px.
- **Secondary:** 1px ink outline on the white sheet, ink label; for copy, download, share.
- **Quiet:** ink text with a 1px underline that thickens to 2px on hover.

### Chips
- **Style:** square label on sheet tone, ink semibold 14px, tabular figures; the accent tone fills with the marker.
- **State:** as a toggle, `aria-pressed`; selected = marker fill, ink border and a drawn check, so selection never relies on colour alone. Unselected toggles show an ink border on hover.

### Cards / Containers
- **Corner Style:** 4px.
- **Background:** the white sheet on paper; quieter secondary panels sit on sheet tone.
- **Shadow Strategy:** none (see Elevation).
- **Border:** 1px hairline on the shared Card; landing panels drop the hairline and separate by tone alone.
- **Internal Padding:** 20px, 24px from 640px; large landing panels 24px to 36px.

### Callouts
A note on a tone step. Plan findings sit on the pale marker pass with a small solid ink square before the title; context notes sit on sheet tone with no square. An optional "Why:" line explains the finding in pencil.

### Inputs / Fields
- **Style:** white sheet, 1px control-edge border, 3px corner, at least 44px tall, ink text. Selects share one drawn ink chevron. Inline sentence fields inherit the sentence's size and bold weight.
- **Focus:** 2px ink outline offset 2px; hover darkens the border to ink.
- **Range, checkbox, radio:** native controls tinted ink via `accent-color`.

### Navigation
- **Desktop (1024px+):** a plain paper bar with a hairline bottom edge: wordmark, three 15px semibold links in pencil that turn ink on hover, and the primary "Plan PTO" button. The current page is ink with a 9px marker stroke behind the lower half of its label.
- **Phone:** a fixed bottom tab bar on the white sheet with four destinations, 22px outline icons over 12px labels; the active tab is bold ink and its icon carries a marker bar.

### Footer
The page's one drenched field: an ink close with "Gapless" set condensed at full width (up to 17rem), then link columns in light greys (#ececE6 links, #b5b5ad captions) with a white focus ring. No marker in the footer.

### Calendar Day Cell (signature)
The product's core unit. A PTO day is a solid ink block with a white bold numeral; pinned and unpaid days share that fill exactly and add a pin or ring glyph. Days off sit on the continuous marker run with ink numerals; weekends outside a run take the weekend tone with pencil numerals; a holiday adds a pencil dot below the numeral. An alternative placement is a 1px dashed ink outline with no fill. Today is a 2px ink ring offset 2px. Hovering a break gives its run a second marker pass and an ink outline. Out-of-range days fade to light pencil and are inert.

### Marker Swipe
An inset fill covering the lower 0.62em of inline text, cloned across line breaks. It goes on data (a result figure, a "6 calendar days off" fact), never on headline words.

## Do's and Don'ts

### Do:
- **Do** use ink (#141414) for every action and every PTO day, and the marker (#dcf763) only for days off, results, selection and the current destination.
- **Do** set display lines and figures in Archivo at width 75% and weight 800; keep controls and reading text at normal width.
- **Do** keep corners at 3px for controls and 4px for sheets and run ends.
- **Do** separate surfaces with a 1px hairline or one tone step, never a resting shadow.
- **Do** pair every state with a shape or a word as well as a fill (ink block, marker run, dot plus name, pin glyph, dashed outline).
- **Do** keep every touch target at 44px or more, and reserve the phone tab bar's height below 1024px.
- **Do** keep motion to comprehension: 150ms on the custom ease-out for hovers and presses, 160ms when a figure changes, nothing on page load, all of it off under `prefers-reduced-motion`.

### Don't:
- **Don't** introduce a second hue, including blue links or a teal accent.
- **Don't** put the marker on buttons, headers or other chrome, or set the marker on ink outside the logo mark.
- **Don't** use pill-shaped buttons or 12-24px soft cards; full rounding is for dot indicators only.
- **Don't** add tracked uppercase labels or eyebrow captions above headings.
- **Don't** add shadows to anything that does not float.
- **Don't** put the marker swipe or a coloured accent on headline words; mark the data instead.
- **Don't** nest cards; inside a sheet use tone steps or rules.
- **Don't** set text below 12px.
