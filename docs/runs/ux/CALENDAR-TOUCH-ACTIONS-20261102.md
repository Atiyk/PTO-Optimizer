# Consumer UX — mobile calendar touch actions

**Date:** 2026-11-02  
**Owner:** Consumer UX workflow, isolated from the consumer expansion calendar/school conflict PR #89.  
**Base main:** `3187596230768e4818720d1907475c9a3341a54c`  
**Status:** Code and automated regression submitted for review; **not merged or deployed**.

## Confirmed issue

On touch-only devices, `DayCell` first taps merely toggled an internal tooltip state. For ordinary working days, holiday dates without a marginal value, and alternatives without a marginal value, the tooltip had no content (or no actionable button). Therefore tapping those dates could never pin/rule out a day or swap an alternative. In addition, moving focus from the day to the tooltip button closed the tooltip before the action could run. Keyboard Space did not match Enter behavior.

## Implemented

- Any in-range day on a coarse-pointer device now opens an accessible nonmodal disclosure with an explicit **Change this day** action; alternative days offer **Swap this in**.
- Existing include → exclude → automatic cycling remains in the canonical `useAppState.toggleDay`; no new solver or URL contract.
- Touch action surface is fixed within 16px viewport gutters, with 44px minimum buttons at 320px and 375px.
- Escape, Close, tapping outside and focus leaving the disclosure dismiss it. Focus can move from the date to the action without prematurely closing the panel.
- Keyboard Enter and Space both activate the date directly. Mouse/trackpad users retain the existing immediate-click behavior and hover tooltip.
- Added Vitest regression cases for plain days, holidays, alternatives, disabled days, focus transfer, keyboard activation and dismissal.
- Added a dedicated real touch-only Playwright check at 375px and 320px, integrated with the consumer browser workflow, with screenshot and JSON evidence artifacts.

## Acceptance gates

1. Consumer GitHub Actions tests/typecheck/lint/build and browser evidence must pass on **exact PR head**.
2. Independent critic must review the touch interaction, screen reader semantics, focus behavior, 320px overflow, and no regression to hover interactions.
3. Vercel consumer preview must be **READY at the same PR head SHA**. The owner-approved daily deployment quota exception allows further coding but **does not waive** preview verification or production READY-SHA confirmation.
4. No `apps/teams` or employer/B2B files changed. Preserve PR #87/#88 until their own merge gates pass.
5. Once safely merged, update `docs/runs/ux/STATUS.md` on the latest main and verify Vercel production READY on the exact merge SHA.

**Known blocker:** Vercel free daily deployment quota has rejected recent preview builds. Keep this PR draft while quota or critic evidence is outstanding. Do not treat CI green as proof of production deployment.
