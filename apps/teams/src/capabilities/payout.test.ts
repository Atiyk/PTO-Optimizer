import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { computePayout, STATE_PAYOUT_RULES } from '@daysoff/engine/leave/payout';
import type { Db } from '@/db/client';
import { auditLog, locations, memberPayRates } from '@/db/schema';
import { buildOrg, humanActor, NOW, run } from '@/test/fixtures';
import { freshDb } from '@/test/db';
import type { Actor } from './types';

/*
 * PTO payout (Phase 4): the engine's numbers, the CA rule with its citation, who may see money
 * (managers/admins when on; an employee only their own and only with the admin opt-in; never
 * agents), rates never leave the module or reach the audit log, and tenant isolation.
 */

let db: Db;
let A: Awaited<ReturnType<typeof buildOrg>>;
let B: Awaited<ReturnType<typeof buildOrg>>;
const RATE = 23.47;
const owner = () => humanActor(A.owner);
beforeEach(async () => {
  db = await freshDb();
  A = await buildOrg(db, 'Acme');
  B = await buildOrg(db, 'Globex');
  await db.update(locations).set({ subdivisionCode: 'US-CA' }).where(eq(locations.id, A.location.id));
});

async function moneyOn(employees = false) {
  await run(db, owner(), 'managePayout', { op: 'setVisibility', moneyEstimates: true, employeeEstimates: employees });
  await run(db, owner(), 'managePayout', { op: 'setPayRate', memberId: A.emp.id, hourlyRate: RATE, effectiveFrom: '2026-01-01' });
}

describe('getPayoutEstimate', () => {
  it('equals the engine for the ledger balance, with California’s cited rule at separation', async () => {
    const e = await run(db, humanActor(A.emp), 'getPayoutEstimate', { leaveType: 'vacation' });
    const b = await run(db, humanActor(A.emp), 'getMyBalance', { leaveType: 'vacation' });
    expect(e.configured).toBe(false);
    expect(e.state).toMatchObject({ state: 'CA', citation: { section: '§ 227.3' } });
    const engine = computePayout({
      policy: { separation: { mode: 'state_law' }, yearEnd: 'forfeit_excess', voluntaryCashOut: { allowed: false, minBalanceKept: 0, maxPerYear: null }, excludeSick: true },
      balance: { balance: b.balance, unit: b.unit, yearEnd: b.yearEnd },
      scenario: 'separation',
      state: 'CA',
      isSickLeave: false,
    });
    expect(e.separation.payable).toBe(engine.payable);
    expect(e.separation.payable).toBe(b.balance);
    expect(e.separation.rule).toMatchObject({ basis: 'law', citation: { url: STATE_PAYOUT_RULES.CA!.citation!.url } });
    // CA bans forfeiture: nothing is lost at year end even with the default "forfeit" policy.
    expect(e.yearEnd.forfeited).toBe(0);
    expect(e.separation.amount).toBeNull();
    expect(e.notice).toMatch(/payroll provider pays.*Not legal advice/);
    expect(e.policySummary).toBe('At separation: paid where state law requires it · at year end, anything over the carry-over limit is lost (where state law allows) · no cash-out on request · sick leave is never paid out');
  });

  it('money: managers and admins when on; the employee only with the opt-in; never agents', async () => {
    await moneyOn(false);
    const hoursPerDay = 8;
    const self = await run(db, humanActor(A.emp), 'getPayoutEstimate', { leaveType: 'vacation' });
    expect(self.separation.amount).toBeNull();
    expect(self.moneyNote).toMatch(/hasn’t turned on/);
    const asManager = await run(db, humanActor(A.manager), 'getPayoutEstimate', { leaveType: 'vacation', memberId: A.emp.id });
    expect(asManager.separation.amount).toBe(Math.round(asManager.separation.payable * hoursPerDay * RATE * 100) / 100);
    await run(db, owner(), 'managePayout', { op: 'setVisibility', employeeEstimates: true });
    expect((await run(db, humanActor(A.emp), 'getPayoutEstimate', { leaveType: 'vacation' })).separation.amount).toBe(asManager.separation.amount);
    // Another employee never sees a colleague's estimate, in hours or money.
    await expect(run(db, humanActor(A.emp2), 'getPayoutEstimate', { leaveType: 'vacation', memberId: A.emp.id })).rejects.toMatchObject({ code: 'forbidden' });
    // An agent acting for the owner gets hours, never money.
    const agent: Actor = { ...owner(), type: 'agent-on-behalf-of-user', clientId: 'pat_x', onBehalfOfMemberId: A.owner.id };
    const viaAgent = await run(db, agent, 'getPayoutEstimate', { leaveType: 'vacation', memberId: A.emp.id });
    expect(viaAgent.separation.amount).toBeNull();
    expect(viaAgent.moneyNote).toMatch(/never shown to agents/);
  });

  it('never returns or audits a pay rate', async () => {
    await moneyOn(true);
    const outputs = [
      await run(db, humanActor(A.emp), 'getPayoutEstimate', { leaveType: 'vacation' }),
      await run(db, humanActor(A.manager), 'getPayoutLiability', { leaveType: 'vacation' }),
      await run(db, owner(), 'getPayoutLiability', { leaveType: 'vacation', format: 'csv' }),
      await run(db, owner(), 'managePayout', { op: 'get' }),
    ];
    for (const o of outputs) expect(JSON.stringify(o)).not.toContain(String(RATE));
    const audit = await db.select().from(auditLog).where(eq(auditLog.orgId, A.org.id));
    expect(audit.some((a) => a.summary === 'Set a pay rate effective 2026-01-01')).toBe(true);
    expect(JSON.stringify(audit)).not.toContain(String(RATE));
  });
});

describe('getPayoutLiability and managePayout', () => {
  it('per-person table with totals; CSV for admins only; managers see the people they manage', async () => {
    await moneyOn();
    const l = await run(db, owner(), 'getPayoutLiability', { leaveType: 'vacation', sort: 'name' });
    expect(l.rows.map((r) => r.name.untrusted_text)).toEqual([...l.rows.map((r) => r.name.untrusted_text)].sort((a, b) => a.localeCompare(b)));
    expect(l.totals.separationPayable).toBe(Math.round(l.rows.reduce((n, r) => n + r.separationPayable, 0) * 10_000) / 10_000);
    expect(l.rows.find((r) => r.memberId === A.emp.id)!.separationAmount).not.toBeNull();
    await expect(run(db, humanActor(A.manager), 'getPayoutLiability', { leaveType: 'vacation', format: 'csv' })).rejects.toMatchObject({ code: 'forbidden' });
    await expect(run(db, humanActor(A.emp), 'getPayoutLiability', { leaveType: 'vacation' })).rejects.toMatchObject({ code: 'forbidden' });
    const csv = (await run(db, owner(), 'getPayoutLiability', { leaveType: 'vacation', format: 'csv' })).csv!;
    expect(csv).toMatch(/^"Estimate\. Your payroll provider pays/);
    expect(csv).toContain('payable_if_left_today');
  });

  it('a policy that conflicts with California gets a warning, and the state rule wins in the numbers', async () => {
    const r = await run(db, owner(), 'managePayout', { op: 'setPolicy', leaveType: 'vacation', separation: 'no', yearEnd: 'forfeit_excess', sourceQuote: 'Unused vacation is not paid out.' });
    expect(r.warnings.join(' ')).toMatch(/CA requires earned vacation to be paid/);
    expect(r.policies[0]).toMatchObject({ leaveType: 'vacation', sourceQuote: { untrusted_text: 'Unused vacation is not paid out.' } });
    const e = await run(db, humanActor(A.emp), 'getPayoutEstimate', { leaveType: 'vacation' });
    expect(e.configured).toBe(true);
    expect(e.separation.payable).toBe(e.balance);
    expect(e.separation.warnings.length).toBeGreaterThan(0);
  });

  it('pay rates exist only while money estimates (or cost-aware ranking) are on; people only; admins only', async () => {
    await expect(run(db, owner(), 'managePayout', { op: 'setPayRate', memberId: A.emp.id, hourlyRate: 20, effectiveFrom: '2026-01-01' })).rejects.toMatchObject({ code: 'invalid_input' });
    await moneyOn();
    expect(await db.select().from(memberPayRates).where(eq(memberPayRates.orgId, A.org.id))).toHaveLength(1);
    await run(db, owner(), 'managePayout', { op: 'setVisibility', moneyEstimates: false });
    expect(await db.select().from(memberPayRates).where(eq(memberPayRates.orgId, A.org.id))).toHaveLength(0);
    await expect(run(db, humanActor(A.manager), 'managePayout', { op: 'get' })).rejects.toMatchObject({ code: 'forbidden' });
    const agent: Actor = { ...owner(), type: 'agent-on-behalf-of-user', clientId: 'pat_x', onBehalfOfMemberId: A.owner.id };
    await expect(run(db, agent, 'managePayout', { op: 'setVisibility', employeeEstimates: true })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('tenant isolation: no estimate, rate or row across orgs', async () => {
    await moneyOn();
    await expect(run(db, owner(), 'getPayoutEstimate', { leaveType: 'vacation', memberId: B.emp.id })).rejects.toMatchObject({ code: 'not_found' });
    await expect(run(db, owner(), 'managePayout', { op: 'setPayRate', memberId: B.emp.id, hourlyRate: 20, effectiveFrom: '2026-01-01' })).rejects.toMatchObject({ code: 'not_found' });
    const l = await run(db, owner(), 'getPayoutLiability', { leaveType: 'vacation' });
    expect(l.rows.map((r) => r.memberId)).not.toContain(B.emp.id);
    expect(await db.select().from(memberPayRates).where(eq(memberPayRates.orgId, B.org.id))).toHaveLength(0);
    const bView = await run(db, humanActor(B.owner), 'managePayout', { op: 'get' });
    expect(bView).toMatchObject({ moneyEstimates: false, ratesOnFile: 0, policies: [] });
    expect(NOW).toBeTruthy();
  });
});
