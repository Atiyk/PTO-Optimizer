import { afterEach, describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { DEFAULT_WORK_WEEK } from '@daysoff/engine/solver/types';
import type { TimeOffPolicy } from '../policy/model';
import { createPtoRequest } from '../personal/requestLedger';
import { expirationRisks } from '../personal/expiration';
import { rescuePlans } from '../personal/expiryRescue';
import { useAppState } from '../ui/useAppState';
import { adoptPlanHandoff, storePlanHandoff } from '../ui/planHandoff';
import { isPlanAddressKey, PLAN_PRIVATE_KEYS } from '../ui/shareFormat';

const TODAY = '2026-11-11';
// The critic's repro: 17.5 days, front-loaded, no carryover, an approved request Nov 23-25,
// plus one manually planned day only My PTO knows about.
const policy: TimeOffPolicy = {
  unit: 'days', hoursPerDay: 8, accrual: { kind: 'front-loaded', amount: 15, grantDate: '2027-01-01' },
  planYear: { kind: 'calendar' }, carryover: { mode: 'none' }, negativeBalanceAllowance: 0,
  payoutOnLeaving: 'not-sure', currentBalance: 17.5, balanceAsOf: '2026-11-01', plannedDays: ['2026-12-02'],
};
const approved = createPtoRequest(
  { start: '2026-11-23', end: '2026-11-25', status: 'approved', note: 'PRIVATE note' },
  { workWeek: DEFAULT_WORK_WEEK, offDays: [] }, 'approved-1',
)!;
const calendar = { workWeek: DEFAULT_WORK_WEEK, offDays: ['2026-11-26', '2026-12-25'] };

afterEach(() => {
  window.history.replaceState(null, '', '/');
  window.sessionStorage.clear();
});

async function ptoDaysFor(search: string, historyState: unknown): Promise<string[]> {
  window.history.replaceState(historyState, '', `/pto?${search}`);
  const view = renderHook(() => useAppState([approved], TODAY));
  try {
    await waitFor(() => expect(view.result.current.holidaysReady && !view.result.current.planningPending).toBe(true), { timeout: 10_000 });
    return view.result.current.breaks.flatMap(brk => brk.days.filter(day => view.result.current.isSuggestedPto(day))).sort();
  } finally {
    view.unmount();
  }
}

describe('My PTO expiry hand-off links', () => {
  it('contain only public address keys, for every risk and rescue plan', () => {
    const risks = expirationRisks(policy, 'US', [approved], TODAY);
    expect(risks.length).toBeGreaterThan(0);
    const plans = rescuePlans(risks, { policy, country: 'US', requests: [approved], calendar, today: TODAY });
    const hrefs = [...risks.map(risk => risk.ptoHref), ...[...plans.values()].map(plan => plan.ptoHref)];
    for (const href of hrefs) {
      const params = new URL(href, 'https://gapless.example').searchParams;
      for (const key of params.keys()) expect(isPlanAddressKey(key), `${key} in ${href}`).toBe(true);
      for (const key of PLAN_PRIVATE_KEYS) expect(params.has(key), key).toBe(false);
      expect(href).not.toMatch(/2026-11-2[345]|2026-12-02|PRIVATE/);
    }
  });

  it('plans the same days through the on-device hand-off as the old private link did', async () => {
    const risk = expirationRisks(policy, 'US', [approved], TODAY).find(r => r.canPlan)!;
    expect(risk).toBeDefined();
    const publicSearch = risk.ptoHref.split('?')[1];
    // Before: the link itself carried every reserved date as `bo`.
    const legacy = new URLSearchParams(publicSearch);
    legacy.set('bo', [...risk.unavailableDates!].join(','));
    const before = await ptoDaysFor(legacy.toString(), null);

    // After: follow the public link with the private part handed over on-device.
    const href = storePlanHandoff(risk.ptoHref, risk.privatePlan ?? '');
    const adopted = adoptPlanHandoff(new URL(href, 'https://gapless.example').search, null)!;
    expect(adopted).not.toBeNull();
    const after = await ptoDaysFor(adopted.search, adopted.historyState);
    expect(window.location.search).not.toMatch(/bo=|hx=/);

    expect(before.length).toBeGreaterThan(0);
    expect(after).toEqual(before);
    for (const date of ['2026-11-23', '2026-11-24', '2026-11-25', '2026-12-02']) expect(after).not.toContain(date);
    // The approved request is blocked by the planner's own ledger even without a hand-off;
    // the manually planned day needs the hand-off.
    const publicOnly = await ptoDaysFor(publicSearch, null);
    for (const date of ['2026-11-23', '2026-11-24', '2026-11-25']) expect(publicOnly).not.toContain(date);
  });
});
