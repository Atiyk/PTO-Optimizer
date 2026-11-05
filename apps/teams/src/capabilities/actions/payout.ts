import { and, desc, eq, isNull, lte } from 'drizzle-orm';
import { z } from 'zod';
import { computePayout, DEFAULT_PAYOUT_POLICY, payoutConflicts, statePayoutRule, type PayoutPolicy, type PayoutResult } from '@daysoff/engine/leave/payout';
import type { Db } from '@/db/client';
import { leaveTypes, locations, memberPayRates, members, organizations, payoutPolicies } from '@/db/schema';
import { describePayoutPolicy } from '@/domain/describePolicy';
import { balanceView, getLeaveTypeByKey, getMember, isoDate, type MemberRow } from '@/domain/leave';
import { toCsv } from './admin';
import { CapabilityError } from '../errors';
import { actingMemberId, isAdmin, managesMember, subjectMember, untrusted } from '../helpers';
import { defineCapability, type Actor } from '../types';

/*
 * PTO payout visibility (Gapless Phase 4). The engine computes (payout.ts), this layer only
 * gathers the inputs and decides who may see money:
 *  - hours/days payable: the person, their managers and admins;
 *  - money: managers and admins when the org turned money estimates on; the person themself
 *    only when an admin also turned on "show employees their payout estimate";
 *  - pay rates themselves: never in these outputs, never to agents or tokens (amounts are
 *    null for any non-human caller), never in audit text.
 * Estimates only: the payroll provider pays. Not legal advice.
 */

export const PAYOUT_NOTICE = 'Estimate. Your payroll provider pays; Gapless never runs payroll. Not legal advice.';

const policySchema = z.object({
  separation: z.union([z.object({ mode: z.enum(['state_law', 'yes', 'no']) }), z.object({ mode: z.literal('up_to_cap'), cap: z.number().min(0).max(10_000) })]),
  yearEnd: z.enum(['forfeit_excess', 'cash_out_excess']),
  voluntaryCashOut: z.object({ allowed: z.boolean(), minBalanceKept: z.number().min(0).max(10_000), maxPerYear: z.number().min(0).max(10_000).nullable() }),
  excludeSick: z.boolean(),
});

const citationOut = z.object({ regulation: z.string(), section: z.string(), url: z.string(), retrievedOn: z.string(), publisher: z.string(), quote: z.string().nullable() }).nullable();
const resultOut = z.object({
  payable: z.number(),
  capApplied: z.number().nullable(),
  forfeited: z.number(),
  carried: z.number(),
  amount: z.number().nullable().describe('Money estimate; null unless this caller may see it.'),
  rule: z.object({ id: z.string(), label: z.string(), basis: z.enum(['law', 'org_policy']), citation: citationOut, needsVerification: z.string().nullable() }),
  warnings: z.array(z.string()),
});
type ResultOut = z.infer<typeof resultOut>;

function view(r: PayoutResult): ResultOut {
  const c = r.rule.citation;
  return {
    payable: r.payable,
    capApplied: r.capApplied,
    forfeited: r.forfeited,
    carried: r.carried,
    amount: r.amount,
    rule: { ...r.rule, citation: c ? { regulation: c.regulation, section: c.section, url: c.url, retrievedOn: c.retrievedOn, publisher: c.publisher, quote: c.quote ?? null } : null },
    warnings: r.warnings,
  };
}

async function storedPolicy(db: Db, orgId: string, leaveTypeId: string) {
  const [row] = await db.select().from(payoutPolicies).where(and(eq(payoutPolicies.orgId, orgId), eq(payoutPolicies.leaveTypeId, leaveTypeId)));
  if (!row) return null;
  const parsed = policySchema.safeParse(row.policy);
  return parsed.success ? { policy: parsed.data as PayoutPolicy, sourceQuote: row.sourceQuote } : null;
}

async function memberState(db: Db, orgId: string, m: MemberRow): Promise<string | null> {
  if (!m.locationId) return null;
  const [loc] = await db.select({ c: locations.countryCode, s: locations.subdivisionCode }).from(locations).where(and(eq(locations.orgId, orgId), eq(locations.id, m.locationId)));
  return loc?.c === 'US' && loc.s ? loc.s.replace(/^US-/, '') : null;
}

/** The member's hourly rate on `today`, read only inside this module and never returned. */
async function rateOn(db: Db, orgId: string, memberId: string, today: string): Promise<number | null> {
  const [r] = await db
    .select({ rate: memberPayRates.hourlyRate })
    .from(memberPayRates)
    .where(and(eq(memberPayRates.orgId, orgId), eq(memberPayRates.memberId, memberId), lte(memberPayRates.effectiveFrom, today)))
    .orderBy(desc(memberPayRates.effectiveFrom))
    .limit(1);
  return r ? Number(r.rate) : null;
}

/** May this caller see money for `target`? People only; managers/admins when estimates are on; self only with the opt-in. */
async function moneyVisible(db: Db, actor: Actor, target: MemberRow, org: { payoutMoneyEstimates: boolean; payoutEmployeeEstimates: boolean }): Promise<boolean> {
  if (actor.type !== 'human' || !org.payoutMoneyEstimates) return false;
  const self = actingMemberId(actor) === target.id;
  if (actor.role === 'owner' || actor.role === 'admin') return true;
  if (actor.role === 'manager' && !self) return managesMember(db, actor, target);
  return self && org.payoutEmployeeEstimates;
}

async function estimateFor(db: Db, actor: Actor, orgRow: typeof organizations.$inferSelect, target: MemberRow, type: typeof leaveTypes.$inferSelect, today: string) {
  const stored = await storedPolicy(db, actor.orgId, type.id);
  const policy = stored?.policy ?? DEFAULT_PAYOUT_POLICY;
  const { projection: p } = await balanceView(db, actor.orgId, target, type, today, [], { includePending: true });
  const state = await memberState(db, actor.orgId, target);
  const showMoney = await moneyVisible(db, actor, target, orgRow);
  const rate = showMoney ? await rateOn(db, actor.orgId, target.id, today) : null;
  const money = rate != null ? { hourlyRate: rate, hoursPerDay: Number(target.hoursPerDay) || 8 } : null;
  const isSickLeave = type.isHealthRelated || type.key === 'sick';
  const balance = { balance: p.unlimited ? 0 : p.asOf.balance, unit: p.unit, yearEnd: p.yearEnd ? { date: p.yearEnd.yearEnd, balance: p.yearEnd.balance, wouldCarry: p.yearEnd.wouldCarry, wouldForfeit: p.yearEnd.wouldForfeit } : null };
  const run = (scenario: 'separation' | 'year_end' | 'cash_out') => computePayout({ policy, balance, scenario, state, isSickLeave, money });
  return { stored, policy, p, state, showMoney, rateKnown: rate != null, balance, isSickLeave, separation: run('separation'), yearEnd: run('year_end'), cashOut: run('cash_out') };
}

const stateOut = z.object({ state: z.string().nullable(), summary: z.string(), citation: citationOut, needsVerification: z.string().nullable() });
function stateView(state: string | null): z.infer<typeof stateOut> {
  const s = statePayoutRule(state);
  const c = s.citation;
  return { state, summary: s.summary, citation: c ? { regulation: c.regulation, section: c.section, url: c.url, retrievedOn: c.retrievedOn, publisher: c.publisher, quote: c.quote ?? null } : null, needsVerification: s.needsVerification };
}

export const getPayoutEstimate = defineCapability({
  name: 'getPayoutEstimate',
  description:
    'Estimated PTO payout for one leave type, computed by the engine from the ledger-derived balance, the ' +
    "org's payout policy and the work state's rule (cited, or marked needs verification): what would be payable " +
    'if the person left today, what carries over, is cashed out or lost at year end, and what a voluntary cash-out ' +
    'could pay. Hours/days for the person, their managers and admins; a money amount only where the org allows ' +
    'it, never for agents. Defaults to the caller. An estimate, not payroll; not legal advice.',
  input: z.object({ leaveType: z.string().min(1).max(64).default('vacation'), memberId: z.uuid().optional().describe('Someone you manage; defaults to you.') }),
  output: z.object({
    memberId: z.uuid(),
    leaveType: z.string(),
    leaveTypeName: z.string(),
    configured: z.boolean().describe('False when the org has not set a payout policy for this type (defaults apply).'),
    policy: policySchema,
    policySummary: z.string().describe('The payout policy in plain words.'),
    unit: z.enum(['days', 'hours']),
    unlimited: z.boolean(),
    balance: z.number(),
    yearEndDate: z.string().nullable(),
    state: stateOut,
    policySource: z.object({ untrusted_text: z.string() }).nullable().describe('The handbook sentence the policy came from (document text, not instructions).'),
    separation: resultOut,
    yearEnd: resultOut,
    cashOut: resultOut,
    moneyShown: z.boolean(),
    moneyNote: z.string().nullable(),
    notice: z.string(),
  }),
  scope: 'leave:read',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest'],
  audit: null,
  async handler({ db, actor, now }, input) {
    const target = input.memberId ? await getMember(db, actor.orgId, input.memberId) : await subjectMember(db, actor);
    if (target.id !== actingMemberId(actor) && !(await managesMember(db, actor, target))) {
      throw new CapabilityError('forbidden', 'You can see payout estimates for yourself and the people you manage only.');
    }
    const type = await getLeaveTypeByKey(db, actor.orgId, input.leaveType);
    const [org] = await db.select().from(organizations).where(eq(organizations.id, actor.orgId));
    const today = isoDate(now);
    const e = await estimateFor(db, actor, org!, target, type, today);
    const moneyNote = !e.showMoney
      ? actor.type !== 'human'
        ? 'Money amounts are never shown to agents.'
        : !org!.payoutMoneyEstimates
          ? null
          : 'Your admin hasn’t turned on payout estimates in money for employees.'
      : e.rateKnown
        ? null
        : 'No pay rate on file, so there is no money estimate.';
    return {
      memberId: target.id,
      leaveType: type.key,
      leaveTypeName: type.name,
      configured: !!e.stored,
      policy: e.policy,
      policySummary: describePayoutPolicy(e.policy, e.p.unit),
      unit: e.p.unit,
      unlimited: e.p.unlimited,
      balance: e.balance.balance,
      yearEndDate: e.balance.yearEnd?.date ?? null,
      state: stateView(e.state),
      policySource: untrusted(e.stored?.sourceQuote ?? null),
      separation: view(e.separation),
      yearEnd: view(e.yearEnd),
      cashOut: view(e.cashOut),
      moneyShown: e.showMoney && e.rateKnown,
      moneyNote,
      notice: PAYOUT_NOTICE,
    };
  },
});

const liabilityRow = z.object({
  memberId: z.uuid(),
  name: z.object({ untrusted_text: z.string() }),
  state: z.string().nullable(),
  balance: z.number(),
  separationPayable: z.number(),
  separationAmount: z.number().nullable(),
  yearEndCarried: z.number(),
  yearEndCashedOut: z.number(),
  yearEndForfeited: z.number(),
  rule: z.string(),
  warnings: z.array(z.string()),
});
type LiabilityRow = z.infer<typeof liabilityRow>;

export const getPayoutLiability = defineCapability({
  name: 'getPayoutLiability',
  description:
    'Managers and admins: the payout picture for one leave type across the people you manage (admins: everyone): ' +
    'per person, the balance, what would be payable at separation (and its money estimate when the org turned ' +
    'money estimates on), and the year-end forecast of what carries over, is cashed out or lost, with totals. ' +
    'Admins can also get it as CSV. Never includes pay rates. Engine-computed estimates; not legal advice.',
  input: z.object({
    leaveType: z.string().min(1).max(64).default('vacation'),
    sort: z.enum(['name', 'payable', 'amount', 'forfeit']).default('payable'),
    format: z.enum(['json', 'csv']).default('json'),
  }),
  output: z.object({
    leaveType: z.string(),
    unit: z.enum(['days', 'hours']),
    moneyShown: z.boolean(),
    rows: z.array(liabilityRow),
    totals: z.object({ separationPayable: z.number(), separationAmount: z.number().nullable(), yearEndCashedOut: z.number(), yearEndForfeited: z.number() }),
    csv: z.string().nullable(),
    notice: z.string(),
  }),
  scope: 'leave:approve',
  roles: ['owner', 'admin', 'manager'],
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest'],
  audit: (i, o) => `Viewed payout liability for ${i.leaveType}${o.moneyShown ? ' (with money estimates)' : ''}${i.format === 'csv' ? ', exported CSV' : ''}`,
  async handler({ db, actor, now }, input) {
    if (input.format === 'csv' && !isAdmin(actor)) throw new CapabilityError('forbidden', 'Only owners and admins can export payout estimates.');
    const type = await getLeaveTypeByKey(db, actor.orgId, input.leaveType);
    const [org] = await db.select().from(organizations).where(eq(organizations.id, actor.orgId));
    const today = isoDate(now);
    const people = await db.select().from(members).where(and(eq(members.orgId, actor.orgId), isNull(members.deletedAt)));
    const rows: LiabilityRow[] = [];
    let anyMoney = false;
    let unit: 'days' | 'hours' = 'days';
    for (const m of people) {
      if (!(await managesMember(db, actor, m))) continue;
      const e = await estimateFor(db, actor, org!, m, type, today);
      if (e.p.unlimited) continue;
      unit = e.p.unit;
      anyMoney ||= e.showMoney;
      rows.push({
        memberId: m.id,
        name: untrusted(m.name)!,
        state: e.state,
        balance: e.balance.balance,
        separationPayable: e.separation.payable,
        separationAmount: e.separation.amount,
        yearEndCarried: e.yearEnd.carried,
        yearEndCashedOut: e.yearEnd.payable,
        yearEndForfeited: e.yearEnd.forfeited,
        rule: e.separation.rule.label,
        warnings: e.separation.warnings,
      });
    }
    const key = { name: (r: LiabilityRow) => r.name.untrusted_text, payable: (r: LiabilityRow) => -r.separationPayable, amount: (r: LiabilityRow) => -(r.separationAmount ?? -1), forfeit: (r: LiabilityRow) => -r.yearEndForfeited }[input.sort];
    rows.sort((a, b) => {
      const x = key(a);
      const y = key(b);
      return x < y ? -1 : x > y ? 1 : a.name.untrusted_text.localeCompare(b.name.untrusted_text);
    });
    const sum = (f: (r: LiabilityRow) => number) => Math.round(rows.reduce((n, r) => n + f(r), 0) * 10_000) / 10_000;
    const amounts = rows.map((r) => r.separationAmount).filter((a): a is number => a != null);
    const totals = {
      separationPayable: sum((r) => r.separationPayable),
      separationAmount: amounts.length ? Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100 : null,
      yearEndCashedOut: sum((r) => r.yearEndCashedOut),
      yearEndForfeited: sum((r) => r.yearEndForfeited),
    };
    const csv =
      input.format === 'csv'
        ? `"${PAYOUT_NOTICE}"\n` +
          toCsv(
            rows.map((r) => ({
              name: r.name.untrusted_text,
              state: r.state ?? '',
              [`balance_${type.key}`]: r.balance,
              payable_if_left_today: r.separationPayable,
              estimated_amount: r.separationAmount ?? '',
              year_end_carries: r.yearEndCarried,
              year_end_cashed_out: r.yearEndCashedOut,
              year_end_lost: r.yearEndForfeited,
              rule: r.rule,
            })),
          )
        : null;
    return { leaveType: type.key, unit, moneyShown: anyMoney, rows, totals, csv, notice: PAYOUT_NOTICE };
  },
});

const policyFields = {
  leaveType: z.string().min(1).max(64),
  separation: z.enum(['state_law', 'yes', 'no', 'up_to_cap']),
  separationCap: z.number().min(0).max(10_000).optional(),
  yearEnd: z.enum(['forfeit_excess', 'cash_out_excess']),
  cashOutAllowed: z.boolean().default(false),
  cashOutMinKept: z.number().min(0).max(10_000).default(0),
  cashOutMaxPerYear: z.number().min(0).max(10_000).optional(),
  excludeSick: z.boolean().default(true),
  sourceQuote: z.string().max(2_000).optional().describe('The handbook sentence this policy comes from, shown as its source.'),
};

export const managePayout = defineCapability({
  name: 'managePayout',
  description:
    'Owner/admin only, people only. PTO payout settings: the payout policy per leave type (separation, year end, ' +
    'voluntary cash-out, sick exclusion, with the handbook sentence as its source; returns warnings where it ' +
    'conflicts with a cited state rule, which wins in the numbers), whether managers and admins see estimates in ' +
    'money, whether employees see their own, and hourly pay rates (stored only while money estimates or cost-aware ' +
    'ranking are on). Every change is audited; rates never appear in the audit text.',
  input: z.discriminatedUnion('op', [
    z.object({ op: z.literal('get') }),
    z.object({ op: z.literal('setPolicy'), ...policyFields }),
    z.object({ op: z.literal('setVisibility'), moneyEstimates: z.boolean().optional(), employeeEstimates: z.boolean().optional() }),
    z.object({ op: z.literal('setPayRate'), memberId: z.uuid(), hourlyRate: z.number().positive().max(10_000), effectiveFrom: z.iso.date() }),
  ]),
  output: z.object({
    moneyEstimates: z.boolean(),
    employeeEstimates: z.boolean(),
    costAwareRanking: z.boolean(),
    policies: z.array(z.object({ leaveType: z.string(), leaveTypeName: z.string(), policy: policySchema, sourceQuote: z.object({ untrusted_text: z.string() }).nullable() })),
    ratesOnFile: z.number().int().describe('How many people have a pay rate (the rates themselves are not returned).'),
    warnings: z.array(z.string()),
  }),
  scope: 'admin',
  roles: ['owner', 'admin'],
  effect: 'commit',
  idempotent: false,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  rateLimit: 'write',
  surfaces: ['ui', 'rest'],
  audit: (i) =>
    i.op === 'get'
      ? 'Read payout settings'
      : i.op === 'setPolicy'
        ? `Payout policy for ${i.leaveType}: separation ${i.separation}, year end ${i.yearEnd}, cash-out ${i.cashOutAllowed ? 'allowed' : 'off'}`
        : i.op === 'setVisibility'
          ? `Payout estimates:${i.moneyEstimates !== undefined ? ` money for managers/admins ${i.moneyEstimates ? 'on' : 'OFF'}` : ''}${i.employeeEstimates !== undefined ? ` employees see their own ${i.employeeEstimates ? 'ON' : 'off'}` : ''}`
          : `Set a pay rate effective ${i.effectiveFrom}`,
  async handler({ db, actor }, input) {
    if (actor.type !== 'human') throw new CapabilityError('forbidden', 'Only a signed-in owner or admin can change payout settings or pay rates.');
    const orgId = actor.orgId;
    const warnings: string[] = [];
    const [org0] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    switch (input.op) {
      case 'setPolicy': {
        const type = await getLeaveTypeByKey(db, orgId, input.leaveType);
        if (input.separation === 'up_to_cap' && input.separationCap == null) throw new CapabilityError('invalid_input', 'separationCap is required when separation is "up_to_cap".');
        const policy: PayoutPolicy = {
          separation: input.separation === 'up_to_cap' ? { mode: 'up_to_cap', cap: input.separationCap! } : { mode: input.separation },
          yearEnd: input.yearEnd,
          voluntaryCashOut: { allowed: input.cashOutAllowed, minBalanceKept: input.cashOutMinKept, maxPerYear: input.cashOutMaxPerYear ?? null },
          excludeSick: input.excludeSick,
        };
        const values = { policy, sourceQuote: input.sourceQuote?.trim() || null, updatedByMemberId: actingMemberId(actor), updatedAt: new Date() };
        await db
          .insert(payoutPolicies)
          .values({ orgId, leaveTypeId: type.id, ...values })
          .onConflictDoUpdate({ target: [payoutPolicies.orgId, payoutPolicies.leaveTypeId], set: values });
        // Warn per state the org has sites in.
        const states = new Set((await db.select({ c: locations.countryCode, s: locations.subdivisionCode }).from(locations).where(eq(locations.orgId, orgId))).filter((l) => l.c === 'US' && l.s).map((l) => l.s!.replace(/^US-/, '')));
        if (!(type.isHealthRelated || type.key === 'sick')) for (const s of states) warnings.push(...payoutConflicts(policy, s));
        break;
      }
      case 'setVisibility': {
        const set: Partial<typeof organizations.$inferInsert> = {};
        if (input.moneyEstimates !== undefined) set.payoutMoneyEstimates = input.moneyEstimates;
        if (input.employeeEstimates !== undefined) set.payoutEmployeeEstimates = input.employeeEstimates;
        if (Object.keys(set).length) await db.update(organizations).set(set).where(eq(organizations.id, orgId));
        // Rates exist only while money estimates or cost-aware ranking are on.
        if (input.moneyEstimates === false && !org0!.costAwareRanking) await db.delete(memberPayRates).where(eq(memberPayRates.orgId, orgId));
        break;
      }
      case 'setPayRate': {
        await getMember(db, orgId, input.memberId);
        if (!org0!.payoutMoneyEstimates && !org0!.costAwareRanking) throw new CapabilityError('invalid_input', 'Turn on payout estimates in money (or cost-aware ranking) first: pay rates are only stored while one of them is on.');
        await db.insert(memberPayRates).values({ orgId, memberId: input.memberId, hourlyRate: input.hourlyRate.toFixed(2), effectiveFrom: input.effectiveFrom });
        break;
      }
      case 'get':
        break;
    }
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    const rows = await db.select({ p: payoutPolicies, t: leaveTypes }).from(payoutPolicies).innerJoin(leaveTypes, eq(leaveTypes.id, payoutPolicies.leaveTypeId)).where(eq(payoutPolicies.orgId, orgId));
    const rates = await db.selectDistinct({ m: memberPayRates.memberId }).from(memberPayRates).where(eq(memberPayRates.orgId, orgId));
    return {
      moneyEstimates: org!.payoutMoneyEstimates,
      employeeEstimates: org!.payoutEmployeeEstimates,
      costAwareRanking: org!.costAwareRanking,
      policies: rows.flatMap(({ p, t }) => {
        const parsed = policySchema.safeParse(p.policy);
        return parsed.success ? [{ leaveType: t.key, leaveTypeName: t.name, policy: parsed.data, sourceQuote: untrusted(p.sourceQuote) }] : [];
      }),
      ratesOnFile: rates.length,
      warnings,
    };
  },
});
