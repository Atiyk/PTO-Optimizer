# Autonomous consumer redesign (2026-11-04)

Owner brief: a one-time, comprehensive redesign of the consumer Gapless PTO Optimizer (repo root
Vite app), decided autonomously with the installed design skills, multi-agent implementation,
independent critics, then one coordinated release. Scope excludes `apps/teams` and all solver /
calculation code. Durable state for resuming lives in `docs/DESIGN-EXECUTION-STATE.json`.

## Skill inventory (what was actually installed and how it was used)

| Skill | What it does (read from its SKILL.md) | Used by | Outcome |
|---|---|---|---|
| `impeccable` (plugin, incl. finish-reviewer and documenter subagents) | Design-director workflow: PRODUCT.md, direction roll (`concept-seed`), direction contract, craft floor, detector, finish review, DESIGN.md | Orchestrator, visual director, critics | PRODUCT.md written (inferred, labelled); direction rolled (degraded: roll service unreachable, no challengers); contract in `.impeccable/surfaces/`; detector + finish reviewer at the end |
| `design-taste-frontend` (tasteskill v2) | Anti-slop art direction from 247 gallery sites; page run + separate app-screen rules; linter/inspector scripts | Visual director, landing agent, visual critic | House rules adopted (no eyebrows, no tracked caps, no gradients/resting shadows, square buttons, footer close, two-line headlines); app-screen exceptions for the planner |
| `emil-design-eng` | Animation decision framework, easing, press feedback, invisible details | Component engineer | Custom ease-out curve, press scale, no animation on high-frequency/keyboard input |
| `apple-design` | Motion/materials/typography for gesture UI | Mobile agent (reference) | Reduced-motion, tab-bar pattern, 44px targets |
| `design:design-critique`, `design:accessibility-review`, `ux-ui-audit` | Structured critique, WCAG audit, evidence-based probe scripts | Critic agents | Run against rendered screenshots |
| `design:design-system`, `design:ux-copy` | Token/system audit; UX microcopy | System architect, critics | DESIGN-SYSTEM.md; copy review |
| `brand-voice:*` | Brand guideline generation from connected sources (Notion, Gong, Box...) | Brand agent | Not usable: its connectors failed to connect in this session; brand direction derived from repo evidence instead |
| `theme-factory` | Preset artifact themes | none | Not appropriate for a product UI system |

Not installed / not usable: no separate "brand identity" skill beyond `brand-voice`; Figma MCP failed
to connect; image generation unavailable (so the build was code-led, no comps).

Where skills conflicted: see `docs/DESIGN-SYSTEM.md` ("Skill sources and where they disagreed").

## Organisation

| Role | Who | Files |
|---|---|---|
| Orchestrator, brand + visual director, design-system architect | main session | tokens, fonts, primitives, header, footer, exports, icons, docs |
| Planner experience (desktop + mobile + calendar components) | agent "planner" | `App.tsx` and planner components |
| Landing / brand expression | agent "landing" | `Landing.tsx`, `YearStrip.tsx`, 404 |
| My PTO + sabbatical | agent "policy-sabbatical" | `Policy.tsx`, forecast/expiry/payout, `Sabbatical.tsx` |
| Learn + reading pages | agent "learn" | glossary, term pages, FAQ, data sources, privacy, terms, UI gallery |
| Critics (independent, fresh context, rendered evidence only) | separate agents | visual, brand, product UX, mobile UX, technical |

Workers share one branch with disjoint file ownership (worktrees were unnecessary because no two
workers touch the same file); the orchestrator alone builds, commits and pushes.
