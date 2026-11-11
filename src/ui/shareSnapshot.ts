/**
 * Issue 9: what a public share link records so a recipient can tell whether they are
 * seeing the sender's plan. Both fields are derived only from public data:
 *   - `er` (plannerRevision): PLANNER_REVISION of the build that made the link.
 *   - `hf` (holidayFingerprint): a short hash of the public holiday dates (national and
 *     regional data for the link's own country, region and dates) the sender's planner
 *     used. It never covers employer calendars, tracked requests or any other private
 *     input, so it cannot be used to guess them; it only changes when holiday data does.
 * Private adjustments are never encoded, not even as a flag: the recipient is told in
 * general terms that they are not included.
 */
export interface ShareSnapshot {
  plannerRevision?: number;
  holidayFingerprint?: string;
}

/** FNV-1a (32-bit) over the sorted, de-duplicated dates; 8 lowercase hex characters. */
export function publicHolidayFingerprint(dates: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const char of [...new Set(dates)].sort().join(',')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function validPlannerRevision(value: string | null): number | undefined {
  return value !== null && /^[1-9]\d{0,2}$/.test(value) ? Number(value) : undefined;
}

export function validHolidayFingerprint(value: string | null): string | undefined {
  return value !== null && /^[0-9a-f]{8}$/.test(value) ? value : undefined;
}

export function readShareSnapshot(params: URLSearchParams): ShareSnapshot {
  const plannerRevision = validPlannerRevision(params.get('er'));
  const holidayFingerprint = validHolidayFingerprint(params.get('hf'));
  return {
    ...(plannerRevision !== undefined ? { plannerRevision } : {}),
    ...(holidayFingerprint !== undefined ? { holidayFingerprint } : {}),
  };
}

export function writeShareSnapshot(params: URLSearchParams, snapshot: ShareSnapshot | undefined): void {
  if (snapshot?.plannerRevision !== undefined) params.set('er', String(snapshot.plannerRevision));
  else params.delete('er');
  if (snapshot?.holidayFingerprint !== undefined) params.set('hf', snapshot.holidayFingerprint);
  else params.delete('hf');
}

/** What differs from the sender's run, comparing public facts only. */
export interface SharedPlanDifferences { planner: boolean; holidays: boolean }

export function sharedPlanChangeText(differences: SharedPlanDifferences): string | undefined {
  const causes = [
    differences.planner ? 'an earlier version of the planner' : '',
    differences.holidays ? 'older holiday data' : '',
  ].filter(Boolean);
  if (!causes.length) return undefined;
  return `This link was made with ${causes.join(' and ')}, so these breaks were recalculated and may not match what the sender saw.`;
}
