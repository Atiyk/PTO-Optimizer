/**
 * The planner revision recorded in public share links (`er`, src/ui/shareFormat.ts).
 *
 * The solver is deterministic, so the same public inputs give the same ranked breaks -
 * until a release deliberately changes how plans are chosen. Bump this whenever that
 * happens (whenever performanceRegression.test.ts's fingerprints are re-captured), so a
 * recipient opening an older link is told the plan was recalculated with a newer planner.
 *
 * 1: share format v1 (P0) and earlier.
 * 2: issue 5/6 - breaks are whole, separate absences; US travel uses the seasonal figure.
 */
export const PLANNER_REVISION = 2;
