# Consumer UX — copy-request menu keyboard and touch QA (2026-11-02)

## Scope and rationale

The existing BreakCard "Copy request" control declared `aria-haspopup="menu"` and rendered `role="menu"` / `role="menuitem"`, but it did not move focus into the menu, support arrow-key navigation, close with Escape, or restore focus after selection. Its trigger and rows were also shorter than the 44px mobile target. This change fixes the mismatch without touching the solver, URL state, copy formatting, policy calculations, or `apps/teams`.

## Implemented

- Opening by click or ArrowDown focuses the first format; ArrowUp opens at the last format.
- ArrowUp/ArrowDown wrap, Home/End jump to boundaries, Escape closes and returns focus to the trigger; Tab is not trapped.
- Outside pointer and focus interactions dismiss the menu without stealing focus.
- Trigger and menu rows have minimum 44px height, explicit focus rings, menu labeling, and `aria-controls` / `aria-expanded` linkage.
- Copy success or failure is announced to assistive technology and cleared with a cleanup-safe timer. The three existing request formats and clipboard API behavior are unchanged.
- Component regressions cover focus, menu navigation, outside dismissal and touch-target classes.

## Critic / release checklist

- [ ] Exact-head consumer unit tests, typecheck, lint and production build green in GitHub Actions.
- [ ] Exact-head browser/visual evidence at 1440, 768, 375 and 320px, including 320px overflow.
- [ ] Independently inspect keyboard sequence: trigger Enter, ArrowDown, ArrowUp, Home, End, Escape, Tab, selection and outside click on desktop and mobile.
- [ ] Independently check clipboard permission failure, no focus trap, and WCAG-oriented axe/Lighthouse results.
- [ ] Vercel consumer preview READY on the exact head SHA (daily quota may delay this).
- [ ] Independent critic approval, then normal PR merge and production Vercel READY at the exact merge SHA.

## Integration isolation

This PR only modifies `src/ui/BreakCard.tsx`, `src/ui/BreakCard.test.tsx`, and this report. Other UX drafts own App, Landing, DayCell, SiteHeader, Glossary, and their browser scripts. Expansion drafts are gated and must not be merged into the UX release until UX completion is independently verified.

Do not treat CI, preview, reviewer approval or production deployment as passed until independently observed.
