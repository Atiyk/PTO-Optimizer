# Workflow — every change, no exceptions

1. Work on a feature branch. Never commit to `main`.
2. Run `npx vitest run` and `npx tsc --noEmit` — both must be clean before continuing.
3. Screenshot every affected view at 1440px and 375px, before and after.
4. STOP. Show the screenshots and a plain-language summary. Wait for explicit approval.
   Do not push, do not open a PR.
5. After approval: push the branch, open a PR, give the Vercel preview URL.
6. After the preview is approved: merge to `main`.

Never skip step 4 or step 6, even for trivial changes. Verify claims (like a cap on
rendered elements) by counting them in the actual DOM output, not by reading the code.

Never add a submit button, a "Generate" action, or a multi-step form — the app updates
live as inputs change, and that immediacy is the main differentiator. Don't gate any
result behind an explicit action.

Pushing and merging: use the Terminal panel (`run_in_terminal`), not the sandboxed Bash
tool — `gh`/git credentials only exist in the user's real terminal shell, authenticated
once via `gh auth login`. The sandboxed Bash tool has no network/credential access for
GitHub at all.
