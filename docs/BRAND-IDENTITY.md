# Gapless brand identity and logo (2026-11 overhaul)

## Timebower identity

The consumer wordmark is Timebower. Open Day is a rounded black calendar block with a detached square in its upper-right corner. Use the white mark and wordmark on the ink footer. Site surfaces, Signal Blue interaction colors, and Sea Glass calendar meaning follow the existing design tokens.

The website uses Archivo Variable. Keep the landing headline compact, give the main result visual priority, and use tabular numerals where values change or align. Use iOS and Android system styles for a future native planner, with equivalent semantic text roles and platform text scaling.

The original Gapless decisions below document the preceding identity.

Owner of this file: the UX and brand overhaul thread (branch `claude/gapless-ux-brand-overhaul`).
Supersedes the "Highlighted Schedule" identity (PR #114) and the "Marked" wordmark (draft PR
#118, closed as superseded).

## What Gapless stands for

Gapless turns a small PTO allowance into long, unbroken time off by joining it to weekends and
public holidays, deterministically, free, and reproducible from a link. The brand promise is
"no gaps": the plan you see is exact, the link reproduces it, and nothing is hidden behind a
sign-up.

Voice: plain, specific, numerical, calm. Never hype, never legal advice, never a claim the
engine cannot back (see `docs/PRODUCT-TRUTH-AUDIT.md`).

## Why the highlighter went

The previous identity was a lime marker swipe behind words, lime calendar runs and a lime logo
row. Problems found on the live site: the swipe sat behind result figures and inline phrases
("9 days off") and read as a student's notes rather than a product; the fluorescent hue
fought every other piece of state on the calendar; and the identity depended on a decorative
technique instead of on the product's own idea. All of it was removed: `.mark` is now type
weight only, and no fill sits behind text anywhere in the consumer app.

## Direction chosen: "the line"

Seven candidate worlds were listed from the audience's own visual culture (wall planner,
departure board, transit route map, boarding pass, timetable, paint chips, postcards). The
impeccable concept-seed roll (degraded run, no network challengers; seed f67ee34b8bf775b7)
assigned candidate 3, the transit route map, which also carries the mechanism best: a break is
a route line drawn through consecutive days. It lends the product four things only: one route
colour (Line indigo), a cool neutral ground, compact signage-grade type (Archivo at 88% width),
and one signature move, the 3px indigo rule under every days-off run. Navigation and controls
stay standard web patterns.

## Logo process

Concepts drawn and rendered at 16, 24, 32, 64 and 128px on light and dark (boards were made
during the run, not committed):

1. Terminus line (two station rings joined): read as glasses / infinity. Rejected.
2. Arch over a baseline: read as a magnet or doorway. Rejected.
3. Pill run with two stations: read as a toggle switch. Rejected.
4. Three day cells on a rule: read as a bar chart. Rejected.
5. Interchange station on a line: generic "commit" glyph. Rejected.
6. Plain route G: strong at 16px but generic letter-in-tile. Kept as the base.
7. **Bridged G (chosen):** a square-cut G built from straight route segments (5 white
   strokes on the indigo tile), whose gap at the top right is filled by a lavender block
   (now sea glass `#8fd6ca`) separated from the bar by a one-unit cut, so the letter still reads as G while
   its gap is visibly filled: "the gap, filled". A first round-G drawing was rejected by the
   visual critic (it read as a Google-style G and the soft bridge vanished below 32px); the
   square cut fixes both and matches the condensed Archivo wordmark. It reads at 16px, holds
   on light and dark tabs because the tile carries its own ground, and it is specific to this
   product rather than a stock calendar or check icon.

Validation: rendered in the live header at 320, 375, 768 and 1440px; favicon.ico at 16/32/48;
apple-touch-icon 180px; maskable 512px with the mark inside the 80% safe zone; OG images and
the portrait share card draw the same geometry.

Assets: `src/ui/logoMark.ts` (source of truth), `public/favicon.svg`, `public/favicon.ico`,
`public/apple-touch-icon.png`, `public/icons/icon-{192,512,maskable-512}.png`,
`public/brand/gapless-mark.svg`, `public/brand/gapless-lockup-{light,dark}.svg` (the lockup
files set the wordmark as live Archivo text; the app renders the lockup in HTML).

## Canva

The Canva connector was available in this session but was not used to draw the logo: its
generators produce raster AI artwork, and the mark needed exact vector geometry shared by the
app, the icons and the canvas exports. See `docs/UX-EXECUTION-STATE.json` for whether a Canva
brand board was produced afterwards.

## Skills that shaped this

- impeccable: project context, the concept-seed direction roll and its Operate mode rules.
- Independent critic agents (mobile UX and IA; visual, brand and technical) reviewed the built
  app in a browser; their findings and dispositions are in `docs/UX-CRITIC-REPORT.md`.
- Other installed design skills (taste, Emil's design, ux-ui-audit, brand-voice) were
  available but not run in this pass; they are not credited here.

## Palette update: Ink & Signal Blue (2026-11, owner request)

The owner judged Line indigo too close to the generic AI-generated SaaS purple and asked for
Ink & Signal Blue with restrained Sea Glass Teal. The structure ("the line", the bridged G,
type, IA) is unchanged; the hues moved: the tile and actions are Signal Blue `#245da6`, the
mark's bridge is sea glass `#8fd6ca` (teal now means time off, so the filled gap is literally
time off), holidays are teal, and feedback colours are separate. Token values and calendar
semantics: `DESIGN.md`.
