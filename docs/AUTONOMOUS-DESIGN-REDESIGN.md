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

## Stages as run (2026-11-04)

| Stage | What happened | Evidence |
|---|---|---|
| A. Audit | Product truth inferred into `PRODUCT.md`; every shipped capability listed as must-survive; engine and URL state marked frozen | `PRODUCT.md` |
| B. Exploration | Impeccable direction roll (seed `d9bad511168518bc`); "highlighted schedule" chosen over the cream/teal AI default | `.impeccable/surfaces/src-ui-landing-tsx.md`, `docs/DESIGN-DECISIONS.md` |
| C. System + IA | Tokens, Archivo, primitives, desktop bar + phone tab bar | `docs/DESIGN-SYSTEM.md`, `DESIGN.md`, `.impeccable/design.json` |
| D. Implementation | Four page agents in parallel on disjoint files | branch commits |
| E. Visual review | Screenshots at 1440/768/375/320 for every route, before and after | `/mnt/project-files/consumer-redesign/` |
| F. Critique + revision | Two critic rounds; all high findings introduced by the redesign fixed | `docs/DESIGN-CRITIQUE.md` |
| G. Integration + release | One push, one draft release PR; merge and production deploy wait for the owner | `docs/DESIGN-EXECUTION-STATE.json` |

## Scheduled resume: decided against, not configured

The brief asked for a ~5-hour recurring resume "if supported". It was **not configured**. By the
time it could have been set up, no autonomous work was left. Everything remaining is the owner's:
review the draft PR and its Vercel preview, decide the engine question, then approve the merge and
the single production deploy. A timer that wakes every 5 hours to find "still waiting for the
owner" would only burn preview builds and tokens, and it risks the overlapping sessions the brief
forbids. PR activity (CI results, review comments) wakes the session that owns the PR instead.

If a future run does need one, here is the design:
- **Trigger.** A single recurring trigger every 5h runs: "read `docs/DESIGN-EXECUTION-STATE.json`; if
  `status` is `released` or `lock.holder` is a live session other than you, exit; otherwise set
  `lock` {holder, acquired_at, expires_at = +90m}, commit, do `next_actions[0]`, update the state
  file, release the lock".
- **Lock.** The lock is a committed field on the branch, so a push race fails fast. A lock older
  than `expires_at` may be taken over.
- **Stopping.** The trigger deletes itself when `status` becomes `released`.

## Release boundary

- **Merge.** The repo's CLAUDE.md requires the owner's approval of the Vercel preview before
  merging to `main`.
- **Deploy.** The owner asked for exactly one production deployment.
- **Where this run stops.** It stops at the draft PR. It does not merge, does not deploy
  to production, and does not claim a deployment.
