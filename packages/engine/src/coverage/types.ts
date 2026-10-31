import type { ISODate } from '../solver/types';

/*
 * Regulated coverage: rule packs (docs/teams/COVERAGE-SPEC.md §2). Pure data, interpreted by
 * the engine only. Every rule is either cited or explicitly marked "needs verification";
 * the engine never invents a number. Nothing here is legal advice.
 */

export interface Citation {
  /** e.g. "Cal. Code Regs. tit. 22" or "N.Y. Labor Law". */
  regulation: string;
  /** e.g. "§ 101416.5(b)". */
  section: string;
  url: string;
  /** ISO date the source was fetched. */
  retrievedOn: ISODate;
  /**
   * Who published the text we read. `official` = the government publisher; `mirror` = a
   * reproduction of the official text (Justia, Cornell LII) because the official site could
   * not be fetched; `agency_guidance` = the agency's own explainer page.
   */
  publisher: 'official' | 'mirror' | 'agency_guidance' | 'enacted_bill';
  /** Short verbatim excerpt that carries the number. */
  quote?: string;
}

/** Either a citation or an explicit "needs verification" with the reason. */
export type Provenance =
  | { citation: Citation; needsVerification?: false; basis: 'law' }
  | { needsVerification: true; reason: string; basis: 'law'; citation?: Citation }
  /** The org's own policy: no citation, shown as "your policy". */
  | { basis: 'org_policy'; needsVerification?: false; citation?: undefined };

export type MixedAgeMethod = 'youngest' | 'majority' | 'core_child' | 'proportional';

export interface AgeGroup {
  key: string;
  label: string;
  /** Inclusive lower bound in months; used for labels and ordering only (counts are by group). */
  fromMonths: number;
}

export type Rule = Provenance & { id: string; label: string } & (
    | {
        kind: 'ratio';
        ageGroup: string;
        childrenPerStaff: number;
        maxGroupSize?: number | null;
      }
    | {
        kind: 'mixed_age';
        method: MixedAgeMethod;
      }
    | {
        kind: 'role_present';
        credential: string;
        min: number;
        scope: 'room' | 'site';
        /** `children_present`: only blocks with demand. `open`: every block a room has demand or staff. */
        when: 'children_present' | 'open';
      }
    | {
        /** Only staff holding one of these credentials (valid on the date) count in ratio. */
        kind: 'ratio_counts_credential';
        anyOf: readonly string[];
      }
    | { kind: 'min_rest_between_shifts'; hours: number }
    | { kind: 'max_hours_per_day'; hours: number }
    | { kind: 'max_hours_per_week'; hours: number }
    | { kind: 'max_consecutive_days'; days: number }
    | {
        /** Cost flag for ranking, not payroll. */
        kind: 'overtime_flag';
        dailyHours?: number | null;
        weeklyHours?: number | null;
        /** Premium for daily/weekly overtime hours (default 1.5). Hours bands only; never pay. */
        multiplier?: number | null;
        /** Hours in one workday above which time is double time (CA: 12). */
        doubleTimeDailyHours?: number | null;
        /** Default 2. */
        doubleTimeMultiplier?: number | null;
        /**
         * CA-style seventh consecutive workday in a workweek: the first `dailyHours` at
         * `multiplier`, anything above at double time.
         */
        seventhDay?: boolean | null;
      }
    | {
        /** A meal period a shift owes (time clock checks; not used for coverage). */
        kind: 'meal_break';
        /** Owed when the shift's worked time is more than this many hours. */
        whenOverHours: number;
        minutes: number;
        /** 1 = first meal, 2 = second meal (e.g. CA over 10 h). */
        nth?: 1 | 2;
        /** Latest start, in hours of work from the shift start (CA: by the end of hour 5). */
        startByHours?: number | null;
        /** Earliest start, in hours from the shift start (WA: 2). */
        startAfterHours?: number | null;
        /**
         * Local window the meal must fall in, minutes after midnight (NY noonday: 660–840).
         * Owed only when the shift spans the whole window.
         */
        window?: { from: number; to: number } | null;
        /** Owed only when the shift starts before this local minute (NY 2nd meal: 660). */
        shiftStartsBefore?: number | null;
        /** Owed only when the shift ends after this local minute (NY 2nd meal: 1140). */
        shiftEndsAfter?: number | null;
      }
    | {
        /** Paid rest breaks owed per stretch of work (not clocked; attested at clock-out). */
        kind: 'rest_break';
        minutes: number;
        perHours: number;
        /** Count a "major fraction" (more than half) of `perHours` as a full period. */
        majorFraction: boolean;
        /** No rest break owed below this many hours (CA: 3.5). */
        minShiftHours?: number | null;
      }
    | {
        kind: 'sick_accrual';
        /** Earn 1 hour per this many hours worked. */
        hoursPerUnit: number | null;
        annualAccrualCap?: number | null;
        annualUseCap?: number | null;
        balanceCap?: number | null;
        carryoverMax?: number | 'all' | null;
        frontloadHours?: number | null;
        /** First day leave can be used, counting the start date as day 1 (CA: 90). */
        usableFromDay?: number | null;
        /** Employer-size tier this applies to, when the law tiers by size. */
        employerSize?: { min?: number; max?: number } | null;
      }
  );

export type RuleKind = Rule['kind'];
export type RuleOf<K extends RuleKind> = Extract<Rule, { kind: K }>;

export interface RulePack {
  key: string;
  version: number;
  name: string;
  vertical: 'childcare' | 'clinic' | 'general';
  jurisdiction: { country: string; state?: string; city?: string };
  effectiveFrom: ISODate;
  effectiveTo?: ISODate | null;
  /**
   * Demand groups, youngest first: age groups for childcare, services for a clinic. Empty
   * for packs without demand (labour packs).
   */
  ageGroups: readonly AgeGroup[];
  /** Vertical vocabulary, so the same engine reads "children" or "bookings". */
  labels?: { demandUnit: string; groupNoun: string; staffNoun: string };
  rules: readonly Rule[];
  /** Shown wherever the pack appears. */
  notes?: readonly string[];
}

export function rulesOf<K extends RuleKind>(pack: Pick<RulePack, 'rules'>, kind: K): RuleOf<K>[] {
  return pack.rules.filter((r): r is RuleOf<K> => r.kind === kind);
}

export function isVerified(rule: Provenance): boolean {
  return rule.basis === 'org_policy' || (!rule.needsVerification && !!rule.citation);
}

/** Problems with a pack's shape (empty = valid). */
export function validateRulePack(pack: RulePack): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  const groups = new Set(pack.ageGroups.map((g) => g.key));
  for (const r of pack.rules) {
    if (ids.has(r.id)) errs.push(`duplicate rule id ${r.id}`);
    ids.add(r.id);
    // Packs also arrive from JSON (saved or AI-drafted), so check what the type promises.
    const prov = r as Provenance & { id: string };
    if (prov.basis === 'law' && !prov.needsVerification && !prov.citation) errs.push(`${r.id}: a law rule needs a citation or needsVerification`);
    if (r.citation && (!r.citation.url || !r.citation.section || !r.citation.retrievedOn)) errs.push(`${r.id}: citation needs url, section and retrievedOn`);
    if (r.kind === 'ratio') {
      if (!groups.has(r.ageGroup)) errs.push(`${r.id}: unknown age group ${r.ageGroup}`);
      if (!(r.childrenPerStaff > 0)) errs.push(`${r.id}: childrenPerStaff must be > 0`);
      if (r.maxGroupSize != null && !(r.maxGroupSize > 0)) errs.push(`${r.id}: maxGroupSize must be > 0`);
    }
    if (r.kind === 'role_present' && !(r.min >= 1)) errs.push(`${r.id}: min must be ≥ 1`);
    if (r.kind === 'meal_break' && !(r.minutes > 0 && r.whenOverHours >= 0)) errs.push(`${r.id}: a meal break needs minutes > 0 and whenOverHours ≥ 0`);
    if (r.kind === 'rest_break' && !(r.minutes > 0 && r.perHours > 0)) errs.push(`${r.id}: a rest break needs minutes > 0 and perHours > 0`);
    if (r.kind === 'overtime_flag' && r.multiplier != null && !(r.multiplier >= 1)) errs.push(`${r.id}: multiplier must be ≥ 1`);
  }
  if (rulesOf(pack, 'mixed_age').length > 1) errs.push('at most one mixed_age rule');
  return errs;
}
