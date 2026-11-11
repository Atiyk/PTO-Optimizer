import { holidayCoverageMessage, useUncoveredHolidayYears } from './holidayCoverage';

/** Issue 17: a self-contained notice for plan years without holiday data. Renders nothing
 * (and makes no request) while every plan year is in this build's bundled holiday data. */
export function HolidayCoverageNotice({ country, rangeStart, rangeEnd }: { country: string; rangeStart: string; rangeEnd: string }) {
  const message = holidayCoverageMessage(useUncoveredHolidayYears(country, rangeStart, rangeEnd));
  if (!message) return null;
  return (
    <p role="status" className="rounded-[10px] bg-surface-alt p-4 text-sm text-ink">
      {message}
    </p>
  );
}
