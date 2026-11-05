import type { Citation } from '../coverage/types';
import type { LeaveUnit } from './policy';

/*
 * PTO payout (Gapless Phase 4). Pure: given a payout policy, a ledger-derived balance and its
 * year-end projection, a scenario and the work state, return what is payable, any cap applied,
 * what would be forfeited, and the rule that decided it. No I/O, no money unless the caller
 * passes a rate. An estimate for people to read: the employer's payroll provider pays, and
 * none of this is legal advice.
 *
 * State rules: each one carries `{regulation, section, url, retrievedOn}` read from the statute
 * or the state labour department's own page, or is marked `needsVerification` with the reason.
 * Anything not listed here is "needs verification" and follows the written policy.
 */

export type PayoutScenario = 'separation' | 'year_end' | 'cash_out';

export interface PayoutPolicy {
  /** What happens to the unused balance when someone leaves. `state_law` = follow the state rule below. */
  separation: { mode: 'state_law' | 'yes' | 'no' } | { mode: 'up_to_cap'; cap: number };
  /** Above what carries over at year end: lost, or paid out. */
  yearEnd: 'forfeit_excess' | 'cash_out_excess';
  /** Cashing out unused leave while employed. */
  voluntaryCashOut: { allowed: boolean; minBalanceKept: number; maxPerYear: number | null };
  /** Sick leave is excluded from payout (it usually is). */
  excludeSick: boolean;
}

export const DEFAULT_PAYOUT_POLICY: PayoutPolicy = {
  separation: { mode: 'state_law' },
  yearEnd: 'forfeit_excess',
  voluntaryCashOut: { allowed: false, minBalanceKept: 0, maxPerYear: null },
  excludeSick: true,
};

export interface StatePayoutRule {
  state: string;
  /** Earned vacation/PTO must be paid at separation, whatever the policy says. */
  separationRequired: boolean;
  /** Earned vacation can't be forfeited (no use-it-or-lose-it); accrual caps are still allowed. */
  forfeitureBanned: boolean;
  /** Plain-language summary for the UI. */
  summary: string;
  citation: Citation | null;
  /** Set when the rule is not (fully) confirmed from a statute or the agency's own page. */
  needsVerification: string | null;
}

const RETRIEVED = '2026-11-01';

/**
 * The states the product covers. Read on 2026-11-01. Publisher `official` = the government
 * publisher; `agency_guidance` = the labour department's own page; `mirror` = a reproduction of
 * the official text (Justia, Cornell LII, a legal-aid copy of the agency FAQ).
 */
export const STATE_PAYOUT_RULES: Readonly<Record<string, StatePayoutRule>> = {
  CA: {
    state: 'CA',
    separationRequired: true,
    forfeitureBanned: true,
    summary: 'California: vested vacation (and PTO usable like vacation) is paid at separation at the final rate, and can’t be forfeited. A cap on accrual is allowed.',
    citation: {
      regulation: 'Cal. Labor Code',
      section: '§ 227.3',
      url: 'https://law.justia.com/codes/california/code-lab/division-2/part-1/chapter-1/article-1/section-227-3',
      retrievedOn: RETRIEVED,
      publisher: 'mirror',
      quote: 'all vested vacation shall be paid to him as wages at his final rate … an employment contract or employer policy shall not provide for forfeiture of vested vacation time upon termination',
    },
    needsVerification: null,
  },
  CO: {
    state: 'CO',
    separationRequired: true,
    forfeitureBanned: true,
    summary: 'Colorado: all earned vacation (including PTO usable for any purpose) is paid at separation, and earned vacation can’t be forfeited at year end. Caps on future accrual are allowed; sick leave under HFWA is separate.',
    citation: {
      regulation: 'C.R.S. § 8-4-101(14)(a)(III); CDLE INFO #3E',
      section: 'Payment of earned vacation upon separation (May 29, 2024)',
      url: 'https://cdle.colorado.gov/sites/cdle/files/info_%233e_payment_of_earned_vacation_upon_separation_of_employment_05.29.24.pdf',
      retrievedOn: RETRIEVED,
      publisher: 'agency_guidance',
      quote: 'the employer shall pay upon separation from employment all vacation pay earned and determinable',
    },
    needsVerification: null,
  },
  NY: {
    state: 'NY',
    separationRequired: false,
    forfeitureBanned: false,
    summary: 'New York: vacation pay is a wage supplement paid as the written policy says. With no written forfeiture policy, earned vacation is owed at separation.',
    citation: {
      regulation: 'N.Y. Labor Law',
      section: '§ 198-c',
      url: 'https://www.nysenate.gov/legislation/laws/LAB/198-C',
      retrievedOn: RETRIEVED,
      publisher: 'official',
      quote: '“benefits or wage supplements” includes … vacation, separation or holiday pay',
    },
    // The "no written forfeiture policy → must pay" rule is from the NY DOL wage FAQ, read via a
    // legal-aid reproduction (lawhelpny.org); the DOL page itself was not fetched.
    needsVerification: 'The written-forfeiture-notice rule comes from the NY DOL FAQ as reproduced by LawHelpNY; check it against dol.ny.gov.',
  },
  TX: {
    state: 'TX',
    separationRequired: false,
    forfeitureBanned: false,
    summary: 'Texas: vacation and sick pay are owed at separation only if a written agreement or written policy says so.',
    citation: {
      regulation: '40 Tex. Admin. Code',
      section: '§ 821.25(a)',
      url: 'https://www.law.cornell.edu/regulations/texas/40-Tex-Admin-Code-SS-821-25',
      retrievedOn: RETRIEVED,
      publisher: 'mirror',
      quote: 'vacation pay and sick leave pay are payable to an employee upon separation from employment only if a written agreement with the employer or a written policy of the employer specifically provides for payment',
    },
    needsVerification: null,
  },
  WA: {
    state: 'WA',
    separationRequired: false,
    forfeitureBanned: false,
    summary: 'Washington: the state does not require vacation; payout follows the employer’s policy or agreement.',
    citation: {
      regulation: 'Washington L&I',
      section: 'Holiday, vacation and bereavement leave',
      url: 'https://lni.wa.gov/workers-rights/leave/holiday-vacation-bereavement-leave',
      retrievedOn: RETRIEVED,
      publisher: 'agency_guidance',
      quote: 'Washington State does not require employers to provide leave or pay for holidays, vacations, or bereavement.',
    },
    needsVerification: 'L&I’s page says vacation follows employer policy but does not address payout at separation directly.',
  },
};

/** The rule for a state: a listed one, or "needs verification, follow the written policy". */
export function statePayoutRule(state: string | null | undefined): StatePayoutRule {
  const s = (state ?? '').toUpperCase().replace(/^US-/, '');
  const known = STATE_PAYOUT_RULES[s];
  if (known) return known;
  return {
    state: s || 'unknown',
    separationRequired: false,
    forfeitureBanned: false,
    summary: `${s || 'This state'}: not researched yet. The estimate follows your written policy.`,
    citation: null,
    needsVerification: 'State payout rules not researched yet; confirm with the state labour department.',
  };
}

export interface PayoutBalance {
  /** Ledger-derived balance today, in `unit`. */
  balance: number;
  unit: LeaveUnit;
  /** From the engine's year-end projection (policy carryover applied). */
  yearEnd: { date: string; balance: number; wouldCarry: number; wouldForfeit: number } | null;
}

export interface PayoutInput {
  policy: PayoutPolicy;
  balance: PayoutBalance;
  scenario: PayoutScenario;
  /** Two-letter US state of the work site. */
  state: string | null;
  isSickLeave: boolean;
  /** Cash-out only: hours/days asked for, and already cashed out this plan year. */
  cashOut?: { requested: number; alreadyThisYear: number };
  /** Only when the caller may see money: the hourly rate, and hours per day for day-based leave. */
  money?: { hourlyRate: number; hoursPerDay: number } | null;
}

export interface PayoutRuleApplied {
  id: string;
  /** What decided the number, in words. */
  label: string;
  basis: 'law' | 'org_policy';
  citation: Citation | null;
  needsVerification: string | null;
}

export interface PayoutResult {
  scenario: PayoutScenario;
  unit: LeaveUnit;
  /** Amount payable in `unit`. */
  payable: number;
  /** The cap that limited `payable`, if any. */
  capApplied: number | null;
  /** Lost under this scenario (year end: above carryover with forfeit; separation: unpaid balance). */
  forfeited: number;
  /** Year end only: what carries into next year. */
  carried: number;
  /** Money estimate for `payable`, when `money` was given. Rounded to cents. */
  amount: number | null;
  rule: PayoutRuleApplied;
  /** Policy settings that conflict with the state rule (the state rule wins in the numbers). */
  warnings: string[];
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;
const cents = (n: number) => Math.round(n * 100) / 100;

function money(payable: number, unit: LeaveUnit, m: PayoutInput['money']): number | null {
  if (!m) return null;
  return cents(payable * m.hourlyRate * (unit === 'days' ? m.hoursPerDay : 1));
}

function lawRule(id: string, label: string, s: StatePayoutRule): PayoutRuleApplied {
  return { id, label, basis: 'law', citation: s.citation, needsVerification: s.needsVerification };
}
function policyRule(id: string, label: string): PayoutRuleApplied {
  return { id, label, basis: 'org_policy', citation: null, needsVerification: null };
}

/** Settings in `policy` that the state's rule overrides, in words. */
export function payoutConflicts(policy: PayoutPolicy, state: string | null): string[] {
  const s = statePayoutRule(state);
  const out: string[] = [];
  if (s.separationRequired && (policy.separation.mode === 'no' || policy.separation.mode === 'up_to_cap')) {
    out.push(`${s.state} requires earned vacation to be paid at separation; "${policy.separation.mode === 'no' ? 'no payout' : 'payout up to a cap'}" doesn't apply there.`);
  }
  if (s.forfeitureBanned && policy.yearEnd === 'forfeit_excess') {
    out.push(`${s.state} doesn't allow earned vacation to be forfeited at year end; cap accrual instead, or cash out the excess.`);
  }
  return out;
}

/** The payout for one person, one leave type and one scenario. */
export function computePayout(input: PayoutInput): PayoutResult {
  const { policy, balance, scenario } = input;
  const unit = balance.unit;
  const state = statePayoutRule(input.state);
  const warnings = input.isSickLeave ? [] : payoutConflicts(policy, input.state);
  const bal = Math.max(0, r4(balance.balance));
  const base = { scenario, unit, capApplied: null as number | null, carried: 0, warnings };

  if (input.isSickLeave && policy.excludeSick) {
    const forfeited = scenario === 'separation' ? bal : 0;
    return { ...base, payable: 0, forfeited, amount: money(0, unit, input.money), rule: policyRule('sick-excluded', 'Sick leave is not paid out under your policy'), carried: scenario === 'year_end' ? (balance.yearEnd?.wouldCarry ?? 0) : 0 };
  }

  if (scenario === 'separation') {
    if (state.separationRequired && !input.isSickLeave) {
      return { ...base, payable: bal, forfeited: 0, amount: money(bal, unit, input.money), rule: lawRule(`state-${state.state}-separation`, `Paid in full at separation (${state.state} law)`, state) };
    }
    const sep = policy.separation;
    if (sep.mode === 'up_to_cap') {
      const payable = Math.min(bal, sep.cap);
      return { ...base, payable, capApplied: bal > sep.cap ? sep.cap : null, forfeited: r4(bal - payable), amount: money(payable, unit, input.money), rule: policyRule('policy-separation-cap', `Paid at separation up to ${sep.cap} ${unit} (your policy)`) };
    }
    if (sep.mode === 'yes') return { ...base, payable: bal, forfeited: 0, amount: money(bal, unit, input.money), rule: policyRule('policy-separation-yes', 'Paid in full at separation (your policy)') };
    if (sep.mode === 'no') return { ...base, payable: 0, forfeited: bal, amount: money(0, unit, input.money), rule: policyRule('policy-separation-no', 'Not paid at separation (your policy)') };
    // state_law where the state does not require payout: the written policy decides, and it says nothing more.
    return {
      ...base,
      payable: 0,
      forfeited: bal,
      amount: money(0, unit, input.money),
      rule: { ...lawRule(`state-${state.state}-policy`, `${state.state} leaves payout to the written policy, which doesn't promise it`, state), basis: state.citation ? 'law' : 'org_policy' },
    };
  }

  if (scenario === 'year_end') {
    const ye = balance.yearEnd;
    if (!ye) return { ...base, payable: 0, forfeited: 0, amount: money(0, unit, input.money), rule: policyRule('no-year-end', 'No year-end change under this policy') };
    if (state.forfeitureBanned && !input.isSickLeave) {
      // Nothing earned may be lost: the excess is cashed out if the policy says so, otherwise it carries.
      if (policy.yearEnd === 'cash_out_excess') {
        return { ...base, payable: ye.wouldForfeit, carried: ye.wouldCarry, forfeited: 0, amount: money(ye.wouldForfeit, unit, input.money), rule: lawRule(`state-${state.state}-no-forfeit`, `Above the carryover limit is cashed out, never lost (${state.state} law)`, state) };
      }
      return { ...base, payable: 0, carried: r4(ye.wouldCarry + ye.wouldForfeit), forfeited: 0, amount: money(0, unit, input.money), rule: lawRule(`state-${state.state}-no-forfeit`, `Everything carries over; earned vacation can’t be lost (${state.state} law)`, state) };
    }
    if (policy.yearEnd === 'cash_out_excess') {
      return { ...base, payable: ye.wouldForfeit, carried: ye.wouldCarry, forfeited: 0, amount: money(ye.wouldForfeit, unit, input.money), rule: policyRule('policy-year-end-cash-out', 'Above the carryover limit is cashed out (your policy)') };
    }
    return { ...base, payable: 0, carried: ye.wouldCarry, forfeited: ye.wouldForfeit, amount: money(0, unit, input.money), rule: policyRule('policy-year-end-forfeit', 'Above the carryover limit is lost (your policy)') };
  }

  // Voluntary cash-out while employed.
  const vc = policy.voluntaryCashOut;
  if (!vc.allowed) return { ...base, payable: 0, forfeited: 0, amount: money(0, unit, input.money), rule: policyRule('policy-cash-out-off', 'Cashing out is not offered (your policy)') };
  const requested = Math.max(0, input.cashOut?.requested ?? bal);
  const room = Math.max(0, r4(bal - vc.minBalanceKept));
  const yearRoom = vc.maxPerYear == null ? Infinity : Math.max(0, r4(vc.maxPerYear - (input.cashOut?.alreadyThisYear ?? 0)));
  const payable = r4(Math.min(requested, room, yearRoom));
  const capApplied = payable < requested ? (yearRoom < room ? (vc.maxPerYear ?? null) : vc.minBalanceKept) : null;
  return {
    ...base,
    payable,
    capApplied,
    forfeited: 0,
    amount: money(payable, unit, input.money),
    rule: policyRule('policy-cash-out', `Cash-out keeps at least ${vc.minBalanceKept} ${unit}${vc.maxPerYear != null ? `, at most ${vc.maxPerYear} ${unit} a year` : ''} (your policy)`),
  };
}
