---
version: 1
slug: "src-ui-landing-tsx"
primary_target: "src/ui/Landing.tsx"
related_targets: ["src/ui/App.tsx"]
---

# Surface brief: consumer Gapless (landing `/` and planner `/pto`, extending to every consumer route)

Scope: consumer root Vite app. Landing is Persuade; `/pto`, `/policy`, `/sabbatical` are Operate; `/glossary`, `/faq` are Read. One world across all.
Audience/job: salaried employees turning a PTO allowance plus public holidays into long breaks, in short visits, often on a phone.
Constraints: live results (no submit), URL round-trip, free-form dates, engine frozen, WCAG 2.2 AA, prerendered HTML.
Run note: owner's brief forbade design questions, so the direction was taken unattended from a degraded roll (no challengers).

## Direction contract

THESIS: Gapless is a printed schedule someone has gone over with a highlighter. The plan is the marked run of days; the page refuses the category default of a calm cream "wellness" planner with soft cards and a teal accent.

OWN-WORLD: paper-white sheet (#fff) on a neutral off-white page (#f4f4f0), ink #141414 for every action and every PTO day (solid ink blocks), one fluorescent marker #dcf763 for days-off runs, results, selection and the active nav. Archivo variable: condensed 800 for display and figures, normal width for UI. Square 3-4px corners, hairline sheet edges, no shadows at rest, no other hue.

STORY: a visitor sees a real highlighted plan for their country immediately, changes their PTO days in a sentence and watches the marked runs move, then opens the full planner, saves to calendar or tracks the request.

FIRST VIEWPORT: landing: h1 left in condensed display at about 6vw; under it a live sentence form ("I have [15] PTO days in [United States]"); the result figure "N days off" set huge with a marker swipe; full-width year strip of 12 months with marked runs as the visual. Primary action "See the full plan" in solid ink. Planner: a result line with the marked figure, controls in a left rail, calendar dominant.

FORM: highlighted schedule, candidate 5 of 7 grounded list (wall planner, split-flap board, boarding pass, Swiss timetable, highlighted printout, postcard, lido signage). Raises from own list: Swiss timetable grid discipline and tabular figures everywhere; boarding-pass compact date codes. seed:d9bad511168518bc

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
