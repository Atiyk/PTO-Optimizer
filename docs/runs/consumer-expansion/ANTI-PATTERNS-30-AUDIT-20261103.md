# Gapless consumer: 30 anti-pattern screenshot audit

**Owner direction (2026-11-03):** Target no more than two or three recognizable tropes from the provided screenshot, while preserving strong usability. This is a visual, judgment-based constraint; a source scan alone is not a valid PASS. The screenshot covers entries 1–30 but text at positions 3–8 is obscured. Do not invent those words. The independent critic must review the actual rendered site and the visible original screenshot.

## Candidate checklist

| Screenshot entries | Treatment | Evidence requirement |
| --- | --- | --- |
| 1 harsh gradients; 22 radial orbs; 23 dot grids; 29 neon colors; 20 purple/black | Reject. Flat warm-neutral background, restrained evergreen-teal controls; no decorative overlays. | CSS source guard + computed browser styles and screenshots |
| 2 Lucide icons; 24 sparkle icons; 25 animated arrows | Reject generic icon overload and purposeless animation. Keep custom calendar mark and navigation icons only as functional. | Source guard, interaction and reduced-motion review |
| 3–8 partly obscured | No claim of verified compliance. Avoid gratuitous rainbow/liquid-glass/shadows and other ornamental effects; check against full source if available. | Critic visual audit |
| 9 em dashes; 15 canned "not X, it's Y" copy | Avoid formulaic AI-style marketing. Ordinary punctuation may still be used naturally. | Editorial review |
| 10 Inter/Geist/Space Grotesk | Reject; established self-hosted Figtree is the sole typeface for the consumer UI. | Computed font in real browser |
| 11 colored left stripes | Avoid repeated decorative card stripes. A purposeful privacy emphasis band can be retained if semantically useful. | Screenshot/context review |
| 12 fake testimonials | Never invent customer endorsements or social proof. | Copy/source review |
| 13 bento grids; 14 fake terminal window | Reject arbitrary irregular card collages and mock terminals. Use clear equal-priority navigation cards and the real live optimizer preview. | Responsive screenshot review |
| 16 checkmark bullets; 17 three pricing tiers | Avoid generic decorative ✓ bullets and fictional pricing; this is a free consumer utility. | UI copy/route review |
| 18 no real product demos | Not applicable: homepage has the actual functioning PTO recommendation, live slider, dates and country controls. | Browser control/result/URL checks |
| 19 soft rounded corners | Possible intentional exception 1: moderate card and control radii for familiar grouping, not exaggerated pill shapes everywhere. | Visual density review |
| 21 no skeleton loaders | Not universally a defect for synchronous deterministic calculations; use real async loading and empty states when relevant, never fake loading animations. | Loading/empty-state browser QA |
| 26 no Terms of Service; 27 no privacy policy | Privacy page is in current draft; add a visible Terms of use page and cross-link from footer/privacy. Both require truthful product data-flow and independent language review. | Links, static page QA, privacy/legal critic |
| 28 hover animations | Possible intentional exception 2: restrained hover/focus affordances with reduced-motion support, not ornamental effects. | Mouse, keyboard, reduced-motion checks |
| 30 basic pastel colors | Possible intentional exception 3: subtle sage background tint for legibility and calendar context, not an arbitrary pastel-gradient collage. | CSS contrast and viewport screenshots |

**Provisional intentional exceptions:** #19, #28 and #30 only. This is a TARGET, not a verified final count. The critic must challenge any other clearly visible screenshot trope and report an exact-head PASS/BLOCK after screenshot review. Avoid sacrificing necessary focus indicators, 44px targets, informative loading states or semantic typography just to match a viral screenshot.

## Implementation and release gate

- Keep all UI polish on existing consolidated PR #112. In draft add real Terms of use at /terms.html, visible footer link, accessible headings, privacy cross-link, and matching neutral styling.
- Use src/ui/designAntiPatterns.test.ts as a lightweight source guard for gradient/orb/dot/neon decorations, generic icon packages, fake testimonials and the presence of a live demo plus legal links. This does NOT replace manual screenshots.
- Run exact final-head tests, TypeScript, lint, production build/prerender, URL/country/privacy checks, 1440/768/375/320 real-browser screenshots, keyboard/touch/focus, axe and Lighthouse.
- Independent read-only critic must inspect actual visual results, document pattern count and all defects, then give explicit PASS only after fixes and revalidation. Terms wording needs human/legal approval if presented as enforceable legal terms.
- Preserve B2B apps/teams and shared packages/engine. Avoid repeated Vercel previews on the free tier: batch changes before pushing and do not merge or production deploy early. Preserve owner's final coordinated-release preference.
