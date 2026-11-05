# Design decisions (consumer redesign, 2026-11-04)

Each decision gives what we chose, what we rejected, and why. The owner's brief said not to ask design
questions, so every choice here was made by the run. Each one can be revisited on its own.

## D1. Direction: "the highlighted schedule"
- **Chose:** ink on paper with one fluorescent marker (#dcf763). The plan is the highlighted
  run of days.
- **Rejected:** the previous cream/teal "calm premium" look. Impeccable flags it as a stock AI
  default, and it said nothing about the product.
- **Why:** the product's output is a run of consecutive days off. A highlighter run is the most
  literal and ownable picture of that, and the same mark carries from the landing hero to the
  calendar, the share card and the OG images.

## D2. One marker, ink as the action colour
- The marker is a highlight, never a button colour. Primary actions are solid ink, so the
  marker always means "this is your time off". After critique round 1, chrome hovers (buttons,
  footer links, the quiet link) moved off the marker to ink and underline. That keeps the
  marker's meaning pure.
- No other hue. Errors use ink, an icon and words, with #b42318 only when unavoidable.

## D3. Archivo variable (width axis), self-hosted
- One family. Condensed 75% at 800 for display and figures, normal width for reading.
- Rejected: keeping Figtree (generic) or adding a second display face (more weight, more drift).
- Cost: about +27 KB gzip per route (technical critic). We accepted it because LCP held or improved
  under a 4x CPU throttle and CLS stayed 0 thanks to the metric-matched fallback. Figtree was then
  deleted from `public/fonts`.

## D4. Square corners, no resting shadows
- Buttons, inputs and chips use 3px corners; panels use 4px. A printed schedule has crisp edges,
  and soft 12–24px cards were part of the generic look we left behind.

## D5. Navigation: desktop bar, phone bottom tab bar
- **lg and up:** wordmark, Sabbatical / My PTO / Learn, and one primary "Plan PTO".
- **Below lg:** a fixed bottom tab bar with four destinations, replacing the Menu disclosure.
  The four tools are the whole product, so a one-tap thumb reach beats a two-tap menu.
  The body reserves the bar's height, and `scroll-padding-bottom` keeps focused or anchored
  content clear of it.

## D6. Landing: the result is the hero
- The first viewport shows a real computed plan for the visitor's country before asking for
  anything (Product principle 1). The controls sit under the result in DOM order, so a screen
  reader hears the answer first.
- There are no testimonials, counts or ratings, because none exist (PRODUCT.md, Evidence).

## D7. Planner layout
- The breaks and the calendar are both first-class. After critique, DOM order must match the visual
  order (WCAG 2.4.3); CSS `order` is not used for reordering.
- Both sliders stay visible at every width (owner rule). The phone tightens around them rather
  than hiding them.

## D8. Calendar semantics never rely on colour alone
- PTO = solid ink block. Days off = marker run, plus an ink edge (added after critique,
  because the marker is 1.2:1 on white). Holiday = dot and a name. Pinned = pin glyph.
  Alternative = dashed outline. Today = 2px ring.

## D9. Motion
- Custom ease-out, sub-200ms. Nothing animates on load, slider drags or typing. Reduced motion
  turns everything off (Emil's rules over Impeccable's appetite for flourish).

## D10. What the redesign deliberately did not touch
- The engine (`packages/engine`), `src/planning`, `src/policy`, `src/personal` and the URL state
  modules are unchanged; the technical critic verified that with `git diff`.
- `apps/teams`, env vars, auth and data handling are unchanged.
- No submit or Generate buttons were added. Free-form date pickers and URL round-tripping are kept.

## Skill conflicts and how they were resolved
See `docs/DESIGN-SYSTEM.md` ("Skill sources and where they disagreed") and
`docs/AUTONOMOUS-DESIGN-REDESIGN.md`.
