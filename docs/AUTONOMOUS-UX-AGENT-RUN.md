# Gapless consumer redesign — autonomous multi-agent implementation brief

**Authorization:** Owner requests unattended implementation and merge after passing quality gates. Do not work on B2B `apps/teams`. This run overrides human-approval stops in repository instructions only for the specifically requested consumer redesign; it does not override CI, branch protection or security checks.

**Repository state (reverify before execution):** On 2026-11-02 the earlier consumer PR stack #73–#77 merged, and `main` reached `50fd12ab27a4d66329369a711f1db7a8600d2682`. The merged `App.tsx` had unexpectedly hidden `PlanSliders` behind `optionsOpen`; this branch restores its visibility. Preserve all newly merged features and re-read the latest branch before more integration work.

## Agent hierarchy

**Orchestrator:** Inspect `main`, open PR stack, CI, root `CLAUDE.md`, Vercel project, and live page. Maintain explicit file ownership, track dependency graphs, prioritize user-visible improvements, integrate workers, request independent critic signoff, merge only safe green PRs and verify deployed SHA. Create small feature branches; avoid working directly on `main`.

**Worker — UX researcher/design director:** Audit 1440px/768px/375px screenshots and real mobile browser interactions, compare relevant D2C UI patterns: Airbnb date range affordances, NerdWallet/Wise transparent live calculators, Monarch Money balance summaries. Borrow interaction principles, not copied branded visuals. Document visual hierarchy, whitespace, typography, card density, sticky result, calendar treatment, and mobile-first interactions. Use existing warm neutrals, burnt-orange and Figtree. Favor one obvious primary CTA per view.

**Worker — planning controls engineer:** Restore both always-visible sliders on `/pto`: the tradeoff slider and break count slider. Keep the `PlanSliders` outside the `optionsOpen` disclosure; this branch restores the visibility regression. Optional planning-style chips may remain as presets, but a dropdown must not replace direct manipulation. Show clear axis labels and numeric result feedback; when a user adjusts a slider manually, switch preset to Custom without unexpected snapback. Support fine keyboard adjustments and proper `aria-label` and value text. Keep employer holidays, blackout dates, workweek and policy edge cases in More Options. Preserve live solving, unrestricted date fields, URL round trip and backwards compatibility.

**Worker — consumer pages/UI engineer:** Homepage should communicate concrete personalized vacation benefit immediately: dates, PTO cost, consecutive calendar days off, observed-holiday assumptions and clear CTA. On desktop use a coherent layout with controls/results and calendar, not six controls crushed into one row. On mobile, prioritize result → visible sliders → compact top three break cards → calendar → advanced. Improve date input handling, contrast, spacing, 44px touch targets, disabled states, legible labels, calendar legend and zero-state/error UX. Avoid visual gimmicks, badge overload, multiple equal CTAs and unsupported marketing numbers.

**Worker — Understand/content editor:** Treat `/glossary` as a hub, not just an alphabetized dictionary. Offer four curated learning pathways: PTO basics, earning days, expiration/carryover, and requesting leave. Add 4–6 accurate standalone prerendered guides where the existing source supports them: accrual examples, what happens to unused PTO, public versus employer holidays, understanding policy language, request timelines and partner scheduling. Each guide includes a worked numerical example, frequent mistakes, 2–3 questions to ask HR, relevant linked glossary entries, source/caveats, and a direct entry into a calculator/planner. Do not invent state labor law. Avoid pseudo-legal assertions, AI-generated filler and thin SEO pages. Ensure unique headings, useful descriptions and readable mobile formatting.

**Worker — AI-agent discovery engineer:** Prioritize real server/prerendered readable HTML, descriptive URLs and links, semantic heading and form structure, field labels, accessible native controls, correct `robots.txt`, sitemap, canonical metadata and truthful structured data. Keep `/llms.txt` as optional navigation only. Do not claim it is required for AI search visibility. Verify that crawler-visible pages contain substantive content and no sensitive user data. Evaluate a documented bounded, read-only planning interface for agent tools only after threat modeling and privacy review; do not expose arbitrary solver compute, leak private calendar data or rely on hidden browser state. Distinguish search discovery from browser-agent operability.

**Worker — AI product experiments:** First write a decision matrix comparing (a) deterministic 'Why this break?' explanations, (b) natural-language constraints mapped to explicit inputs, (c) opt-in policy handbook Q&A with citations and user confirmation, and (d) tailored vacation suggestions grounded in solver outputs. Prefer shipping deterministic explanation sourced from engine facts. No generic chat widget, paid model, document upload or serverless API without permission, privacy terms, rate limit, cost estimate and adversarial prompt-injection tests. Never let an LLM authoritatively calculate balances or determine legal PTO rights.

**Tester/critic (independent):** Review against user intent, reject hidden sliders, broken URL state, bad mobile layout, inaccessible controls, misleading PTO math, crawler-only content, AI hallucinations and unrelated B2B changes. Run `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`; run engine/B2B regression suites if shared code changes. Capture actual screenshots at 1440/768/375 and check 320px overflow; keyboard/tab tests and WCAG 2.2 AA focus/contrast checks; validate prerendered HTML and sitemap. Critic must document unresolved defects before merge.

## Delivery phases
1. Baseline screenshots, repository and PR-stack audit, map user journeys and identify actual visual defects.
2. Slider restoration and planner layout once the dependent PR stack is resolved; no accidental merging of incomplete drafts.
3. Mobile and desktop polish, homepage visual hierarchy and primary controls.
4. Understand hub and substantive practical learning paths; preserve existing glossary links.
5. AI-agent navigation and accessibility, optional `llms.txt` and trusted metadata.
6. Test and optionally ship only deterministic 'Why this plan?' based on engine data, with robust tests.
7. Independent critic review, rerun production build, GitHub PR checks, then normal PR merge and Vercel READY verification at expected SHA.

## Gates and reporting

Never merge directly to main, bypass branch protections, silence failing tests, leak private user data or make production claims from previews. For every PR include screenshots, files changed, before/after behaviors, tests, critic approval and Vercel preview. Preserve all country routes, solver settings, policy flows, share links, sabbatical planning, and B2B isolation. If code cannot be fully validated with available tools, leave a draft PR, document the blocker, and do not report it as shipped.

End with merged commit SHAs, exact deployment aliases and READY SHA, actual tests, before/after screenshots, remaining questions and non-shipped AI concepts. Continue autonomously only in a runtime that genuinely supports persistent work; otherwise complete the current executable tasks and report the limitations honestly.
