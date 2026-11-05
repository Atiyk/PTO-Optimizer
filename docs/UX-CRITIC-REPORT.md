# UX critic report (2026-11-05, overhaul pass 1)

Two independent critics tested the built branch in Chromium at 320-1440px. Every finding got a
fix or a recorded reason.

## Visual, brand and technical critic

| # | Finding | Disposition |
|---|---|---|
| 1 | Round G with a crossbar reads as Google's G; lavender bridge 2.7:1, invisible at 16px | Fixed: mark redrawn as a square-cut G built like calendar cells; bridge #bdbbf8 (>3:1 on the tile) set off by a 1-unit cut |
| 2 | apple-touch / maskable icons were a tile inside a tile | Fixed: full-bleed indigo, glyph inside the safe zone |
| 3 | Days-off tint indistinguishable from weekends where used alone | Fixed: 3px indigo rule added (landing year grid and legend, glossary examples); chips moved to indigo border + pale fill |
| 4 | Selected states split between ink and indigo | Fixed: mode pills, forecast presets, chips, sabbatical selection all indigo |
| 5 | aria-current="page" on a link to another page | Fixed: "page" only on the exact page, "true" for the section |
| 6 | FAQ and Data sources highlight no nav item | Fixed: they sit under Learn |
| 7 | OG image off-brand and with a stale relative date | Fixed: real lockup, no relative date, no button-shaped label |
| 8 | Planner H1 name ran words together | Fixed |
| 9 | Corner scale leaks, square bullets | Bullets fixed; 8px stepper ends kept (they are run ends) |
| 10 | Ink bars where indigo means PTO | Fixed |
| 11 | Comments describing the old system | Fixed |
| 12 | "Plan PTO" naming leftovers | Fixed ("Plan time off", FAQ intro) |
| 13 | Portrait card wordmark weight | Fixed (760) |
| 14 | Mode row adds chrome above the result | Row padding reduced; 44px targets kept by project rule |

## Mobile UX and IA critic

| # | Finding | Disposition |
|---|---|---|
| 1 | Switching mode or tab drops country/PTO/dates | Fixed: links carry c and s (and b, e to /pto) at tap time |
| 2 | Landing, CTA and bare /pto gave three different answers; bare /pto planned only 8 weeks | Fixed: planner default is the next 12 months like the homepage; homepage now leads with the plan total. Remaining difference: the planner keeps 3 reserve days by default and says so |
| 3 | iOS zoom on 15px fields | Fixed: fields are 16px+ under 640px |
| 4 | Calendar about 2 screens down on phones | Fixed: "Calendar / Request each break / Export and share" jump links under the result on phones. More options stays a disclosure in the settings card |
| 5 | Family and Sabbatical hard to find from the homepage | Fixed: one-line links under the hero CTA |
| 6 | /policy shows a forecast before a balance | Fixed: on phones inputs come first until a balance is entered |
| 7 | Landing CTA below the fold at 320x568 | Partly: hero type reduced below 360px |
| 8 | "travel quietness" unexplained on phones | Fixed: short label says "higher is quieter"; estimate flagged outside the US |
| 9 | Desktop calendar copy shown first on touch | Fixed with a CSS hover query (correct from first paint) |
| 10 | Checkbox targets | Not changed: the labels are already 44px rows; "Let the solver decide" renamed "Let the planner choose" |
| 11 | Day sheet covers tapped row | Open (minor) |
| 12 | Tablet used the phone tab bar; GB region labelled "State" | Tab bar fixed (top nav from 768px). Region label open (minor) |
