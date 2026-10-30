import { describe, it, expect } from 'vitest';
import { policyFromLegacyPtoState, toLegacySolverFields } from '../policy/model';
import { solve } from '../solver/solve';
import type { SolveInput } from '../solver/types';

/**
 * Feature 1 Stage 2A follow-through safety net. useAppState.ts used to compute
 * accrualPerMonth/expiryDate/carryoverCap with its own inline ternaries:
 *
 *   accrualPerMonth: accrualEnabled ? accrualPerMonth : undefined,
 *   expiryDate: expiryEnabled ? expiryDate : undefined,
 *   carryoverCap: expiryEnabled ? carryoverCap : undefined,
 *
 * and now routes the same three fields through policyFromLegacyPtoState() +
 * toLegacySolverFields() (the shared policy model). This test locks down that the new path
 * produces byte-identical values to the old ternaries, for every combination of these
 * fields a real /pto URL (ac/am/ex/xd/cc) can express - so a pre-existing shared link keeps
 * producing the exact same plan it always did.
 */
function oldTernaryLogic(fields: {
  accrualEnabled: boolean;
  accrualPerMonth: number;
  expiryEnabled: boolean;
  expiryDate: string;
  carryoverCap: number;
}): { accrualPerMonth?: number; expiryDate?: string; carryoverCap?: number } {
  return {
    accrualPerMonth: fields.accrualEnabled ? fields.accrualPerMonth : undefined,
    expiryDate: fields.expiryEnabled ? fields.expiryDate : undefined,
    carryoverCap: fields.expiryEnabled ? fields.carryoverCap : undefined,
  };
}

function newPolicyPath(fields: {
  budget: number;
  accrualEnabled: boolean;
  accrualPerMonth: number;
  expiryEnabled: boolean;
  expiryDate: string;
  carryoverCap: number;
  rangeStart: string;
}) {
  const policy = policyFromLegacyPtoState(fields);
  return toLegacySolverFields(policy, fields.rangeStart);
}

const CASES: {
  label: string;
  budget: number;
  accrualEnabled: boolean;
  accrualPerMonth: number;
  expiryEnabled: boolean;
  expiryDate: string;
  carryoverCap: number;
  rangeStart: string;
}[] = [
  { label: 'both disabled (today\'s default /pto link, no ac/ex params)', budget: 20, accrualEnabled: false, accrualPerMonth: 1.25, expiryEnabled: false, expiryDate: '2026-12-31', carryoverCap: 0, rangeStart: '2026-01-01' },
  { label: 'accrual on, expiry off (ac=1&am=1.5)', budget: 18, accrualEnabled: true, accrualPerMonth: 1.5, expiryEnabled: false, expiryDate: '2026-12-31', carryoverCap: 0, rangeStart: '2026-02-01' },
  { label: 'accrual off, expiry on (ex=1&xd=...&cc=5)', budget: 25, accrualEnabled: false, accrualPerMonth: 1.25, expiryEnabled: true, expiryDate: '2026-12-31', carryoverCap: 5, rangeStart: '2026-01-01' },
  { label: 'both on (ac=1&am=0.577&ex=1&xd=...&cc=10)', budget: 15, accrualEnabled: true, accrualPerMonth: 15 / 26, expiryEnabled: true, expiryDate: '2026-06-30', carryoverCap: 10, rangeStart: '2026-01-01' },
  { label: 'accrualPerMonth*12 != budget (a normal /pto combination the accrualCap fix had to get right)', budget: 20, accrualEnabled: true, accrualPerMonth: 1.25, expiryEnabled: false, expiryDate: '2026-12-31', carryoverCap: 0, rangeStart: '2026-01-01' },
];

describe('/pto policy rewiring — byte-identical to the old ternary logic', () => {
  for (const c of CASES) {
    it(c.label, () => {
      const oldResult = oldTernaryLogic(c);
      const newResult = newPolicyPath(c);
      expect(newResult.accrualPerMonth).toBe(oldResult.accrualPerMonth);
      expect(newResult.expiryDate).toBe(oldResult.expiryDate);
      // carryoverCap: the old ternary returns `undefined` when expiry is disabled; the new
      // path returns `0` for carryover.mode === 'none'. Both are equivalent to solve.ts,
      // which reads `input.carryoverCap ?? 0` everywhere it's used (and only when
      // expiryDate is set at all) - so this compares them the same way solve.ts does,
      // rather than demanding byte-identical undefined-vs-zero.
      expect(newResult.carryoverCap ?? 0).toBe(oldResult.carryoverCap ?? 0);
      // policyFromLegacyPtoState always sets accrualCap = budget, and toLegacySolverFields
      // was fixed (this PR) to prefer an explicit accrualCap over a budget derived from the
      // accrual amount - so the policy's own "budget" output now always equals /pto's real
      // budget, even when accrualPerMonth*12 != budget (a normal, valid /pto combination,
      // e.g. a starting balance higher than 12 months of accrual would reach on its own).
      // Before that fix, this would NOT have held - see this file's regression-safety intent.
      expect(newResult.budget).toBe(c.budget);
    });
  }

  it('end-to-end: solve() output is identical whether accrual/expiry fields are built the old or new way', () => {
    const base: Omit<SolveInput, 'accrualPerMonth' | 'expiryDate' | 'carryoverCap'> = {
      offDays: ['2026-01-03', '2026-01-04', '2026-01-10', '2026-01-11'],
      rangeStart: '2026-01-01',
      rangeEnd: '2026-03-31',
      budget: 15,
    };
    const fields = { budget: 15, accrualEnabled: true, accrualPerMonth: 1.25, expiryEnabled: true, expiryDate: '2026-02-15', carryoverCap: 3, rangeStart: '2026-01-01' };
    const oldFields = oldTernaryLogic(fields);
    const newFields = newPolicyPath(fields);
    const oldResult = solve({ ...base, accrualPerMonth: oldFields.accrualPerMonth, expiryDate: oldFields.expiryDate, carryoverCap: oldFields.carryoverCap });
    const newResult = solve({ ...base, accrualPerMonth: newFields.accrualPerMonth, expiryDate: newFields.expiryDate, carryoverCap: newFields.carryoverCap });
    expect(newResult).toEqual(oldResult);
  });
});
