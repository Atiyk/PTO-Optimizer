# Design critique log (consumer redesign, 2026-11-04)

Five independent critics inspected the **rendered** build (Playwright at 1440/1024/768/375/320,
axe-core, CDP touch emulation, Lighthouse-style LCP under 4x CPU throttle). None of them wrote the
code they reviewed. In round 1 every critic returned "fix". This file records each high or critical
finding and what was done about it. Raw reports and screenshots stayed in the session's
temporary folders. The evidence that persists is in the commits listed below.

## Round 1: high and critical findings and their resolution

| # | Sev | Critic | Finding | Resolution | Commit |
|---|---|---|---|---|---|
| 1 | critical | Product UX | Pinning Dec 7 on the default /pto plan collapsed it to "0 days off from 0 PTO days" ("cannot fit a 3-day minimum break"). The hover had promised "+3 days off". **Predates the redesign** (the engine is unchanged from main). | The planning-call layer (`src/ui/pinPreview.ts`) solves again without the minimum when pins make the strict solve fail, and the UI says so (`RelaxedMinimumNotice`, with "Remove pinned and excluded dates" / "Use no minimum break"). The hover preview runs the same call, so it can't promise a gain the solver won't deliver. Solver math is unchanged. Regression tests are in `src/ui/pinPreview.test.ts`. | 95c9718, b1c8e8d |
| 2 | high | Technical, UX | /pto tab order jumped back up the page (CSS `order-*`, WCAG 2.4.3). | DOM order now matches the visual order and no `order-*` classes remain. | 95c9718 |
| 3 | high | UX | 426 tab stops in a 1-year calendar. | Roving tabindex: the grid is one tab stop and arrow, Home and End keys move between days. | 95c9718 |
| 4 | high | UX, Visual, Mobile | Breaks buried under 12 months of calendar (y=3247 from the home CTA; about 2,800px down on phones). | A compact "Your breaks" summary sits above the calendar and links to each break card. | 95c9718 |
| 5 | high | UX | "Share with a partner" copied an overlap link and skipped the consent checkbox. | The button opens the "Plan with someone" panel (consent step) and moves focus to it. The one-click copy was removed. | 95c9718 |
| 6 | high | Mobile | The touch day sheet covered the tapped day, didn't name the date, and offered one ambiguous "Change this day" button. | The sheet names the date, sits above the tab bar, and offers Take this day off / Never take this day / Let the planner decide / Close. | 95c9718 |
| 7 | high | Visual | The landing showed only break 1, not the year of marked runs the contract promises. | "Every break in this plan": a printed year schedule with every break as a marker run and a text list for assistive tech. | 2c14a97 |
| 8 | high | Brand | The share image (`imageExport.ts`) used system-ui. | Uses Archivo, with an 800 headline. | b50c046 |
| 9 | high | Brand | Calendar language differed across surfaces (week start, holiday mark, weekend fill). | One language: week start from `weekStartForCountry`, a filled holiday dot, and weekend tone on landing, /pto, /sabbatical and exports. | 2c14a97, 4b26103, 95c9718 |
| 10 | high | Brand | The marker was used as decoration on chrome (footer band, footer link hovers, 404 numeral). | The marker is only for data now. Chrome hovers use ink or underline. | ba796c7, 2c14a97, 1200e1e |
| 11 | high | Brand | /docs page was still in the old slate/navy system. | Restyled to paper/ink, Archivo, square corners, with the shared header. | 1200e1e |
| 12 | critical | Brand | 39 routes still pointed `og:image` at the old navy `og-image.png`. | Per-section OG images (landing, pto, sabbatical, policy, learn), with all metas repointed and the old image deleted. Verified that no HTML references remain. | earlier foundation commit |
| 13 | high | Mobile | Focused controls hidden under the tab bar and the compact bar. | `scroll-padding-top/bottom` below lg. The compact bar is hidden on landscape phones (max-height 500px). | ba796c7, 95c9718 |

## Medium and low findings resolved in the same round

- **Policy:**
  - The loss warning now sits with the forecast figure, and "−0" became "0".
  - The 0-balance default is labelled.
  - "Unallocated PTO in the current optimizer plan" became "Projected balance".
- **Dates:** compact dates everywhere visible. Tracker aria-labels keep ISO, for test stability.
- **One primary per view** on landing, glossary, privacy and terms. There is one CTA label ("See the full plan →").
- **Landing h1:** capped at clamp(2.5rem, 1rem + 5vw, 6rem).
- **Shape and style:**
  - Glossary numerals removed.
  - Pale-lime card tint removed; 6px radii are now 4px.
  - Nested grey boxes removed.
  - Drawn chevrons replaced the Unicode glyphs on controls.
  - `.select-ink` applied to native selects.
- **Touch targets:**
  - Badges are 24px.
  - "Pin this plan" and the Term "?" have 44px hit areas.
  - CountrySelect is 44px.
- **Touch behaviour:**
  - Range inputs use `touch-action: pan-y`, so a vertical swipe scrolls instead of changing the value.
  - Copy says "Tap" or "Click" by hover capability.
  - The shortcuts link is hidden on touch.
- **Fonts and viewport:**
  - `viewport-fit=cover` on every viewport meta, so the safe-area padding works.
  - Figtree and the stray `public/icons.svg` were deleted.
- **Pages and copy:**
  - 404 has site chrome and the Archivo stack.
  - Privacy and terms section padding fixed.
  - Glossary `?q=` round-trips.
  - "Maximize days off together" became "Prioritize days off together".
  - The portrait title is sentence case.
- **Sabbatical:** `sel` links now open on the placement they name. An effect used to discard the value on load.
- **Track this PTO request:** confirms in place ("Tracked") instead of jumping 1,379px down the page.
- **320px:** the plan-recovery notice buttons now wrap instead of overflowing (found by the CI journey check during integration).

## Declined, with reasons

- **Unmarked home params (`/?c=DE&b=20`) restoring the homepage:** declined. Root links without
  `home=1` are historic optimizer share links, and they must keep landing on /pto with their exact
  query (the product rule that old URLs keep working). The landing agent's change was reverted.
- **Subsetting the Archivo width axis (+27 KB gzip):** deferred. LCP held or improved and CLS stayed 0.
- **Calendar cells at 320px are about 35px wide:** seven columns can't reach 44px there. Cells are
  48px tall, so the 24px-with-spacing rule (WCAG 2.5.8) is met, and the touch sheet is the
  main action surface.
- **Country combobox drops focus on Tab:** the baseline does the same. Logged as a follow-up.

## Round 2

See the "Round 2" section appended below after re-inspection.
