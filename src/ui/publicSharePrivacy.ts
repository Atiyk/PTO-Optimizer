import { decodeEmployerCalendar } from '../personal/employerCalendar';

/** Imported, user-authored calendar names and excluded holiday labels are private. */
export function employerLabelsWouldBeShared(query: string): boolean {
  const raw = new URLSearchParams(query).get('eh');
  if (!raw) return false;
  const calendar = decodeEmployerCalendar(raw);
  // Fail closed for an unrecognized payload: never copy it or generate
  // outbound calendar-provider links without informed consent.
  return !calendar || calendar.custom.length > 0 || calendar.excluded.length > 0;
}

/** A public plan link is intentionally not a private employer-calendar export.
 * Preserve normal planning controls but exclude employer labels, incidental
 * query keys and fragments. The recipient's own holiday settings apply instead.
 */
export function buildPublicPlanLink(currentHref: string, planSearch: string): {
  url: string;
  omittedPrivateCalendar: boolean;
} {
  const original = new URL(currentHref);
  const params = new URLSearchParams(planSearch);
  const omittedPrivateCalendar = employerLabelsWouldBeShared(planSearch);
  params.delete('eh');
  params.delete('ov');
  params.delete('signin');
  const result = new URL(original.pathname, original.origin);
  result.search = params.toString();
  return { url: result.toString(), omittedPrivateCalendar };
}
