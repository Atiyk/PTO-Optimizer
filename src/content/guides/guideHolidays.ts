/**
 * The committed holiday files the guide pages read, imported statically so the prerender
 * (Node) and the browser bundle compute from the same bytes. A guide for a new year or
 * country needs its files listed here; guides2027.test.ts fails when one is missing.
 *
 * Each year also needs the next year's file: when Jan 1 of the next year is a Saturday,
 * its observed day falls on Dec 31 (consumerHolidayLookupEnd), as it does for 2028.
 */
import type { HolidaySource } from '../../autopilot/planFromSearch';
import us2026 from '../../../public/holidays/US-2026.json';
import us2027 from '../../../public/holidays/US-2027.json';
import us2028 from '../../../public/holidays/US-2028.json';
import gb2027 from '../../../public/holidays/GB-2027.json';
import gb2028 from '../../../public/holidays/GB-2028.json';

export const GUIDE_HOLIDAY_FILES: Readonly<Record<string, unknown>> = {
  'US-2026': us2026,
  'US-2027': us2027,
  'US-2028': us2028,
  'GB-2027': gb2027,
  'GB-2028': gb2028,
};

export const guideHolidaySource: HolidaySource = (country, year) => GUIDE_HOLIDAY_FILES[`${country}-${year}`] ?? null;
