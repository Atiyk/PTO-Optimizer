/** More PTO days than exist in a decade - the solver itself handles any budget without a
 * fixed cap (see NOTES.md Phase 11/12), so this isn't a technical limit, just the line past
 * which a typed value is clearly not a real annual PTO balance (a stray extra digit, a
 * paste gone wrong) and deserves a message instead of silently "working". */
const MAX_REASONABLE_BUDGET = 3650;

export interface ValidationInputs {
  rangeStart: string;
  rangeEnd: string;
  budget: number;
  expiryEnabled: boolean;
  expiryDate: string;
}

/**
 * Pure validation, same pattern as dayCategory.ts/alternativeForDate.ts: extracted so the
 * exact rules are directly unit-testable. Returns every issue found, not just the first -
 * several can be true at once (e.g. a negative budget AND an inverted date range from the
 * same bad paste), and the UI shows all of them rather than hiding all-but-one.
 */
export function validateInputs({ rangeStart, rangeEnd, budget, expiryEnabled, expiryDate }: ValidationInputs): string[] {
  const issues: string[] = [];

  if (rangeEnd < rangeStart) {
    issues.push('End date is before the start date.');
  }
  if (budget < 0) {
    issues.push("PTO days available can't be negative.");
  } else if (budget > MAX_REASONABLE_BUDGET) {
    issues.push(`${budget} PTO days is far beyond a realistic annual allotment.`);
  }
  if (expiryEnabled && rangeEnd >= rangeStart && (expiryDate < rangeStart || expiryDate > rangeEnd)) {
    issues.push('Expiry date is outside the selected date range.');
  }

  return issues;
}
