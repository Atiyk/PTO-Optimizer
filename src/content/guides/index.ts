import type { Guide } from './types.ts';
import { MAXIMIZE_PTO_2027 } from './maximizePto2027.ts';
import { SUMMER_2027 } from './summer2027.ts';
import { HOLIDAY_SEASON_2027 } from './holidaySeason2027.ts';
import { PTO_EXPIRING } from './ptoExpiring.ts';
import { PTO_ACCRUAL } from './ptoAccrual.ts';
import { ASK_FOR_TIME_OFF } from './askForTimeOff.ts';
import { STATE_GUIDES } from './states2027.ts';

export type { Guide, GuideFaq, GuideSource } from './types.ts';

/** Every published guide, in the order the /guides index lists them. */
export const GUIDES: readonly Guide[] = [
  MAXIMIZE_PTO_2027,
  PTO_EXPIRING,
  HOLIDAY_SEASON_2027,
  SUMMER_2027,
  PTO_ACCRUAL,
  ASK_FOR_TIME_OFF,
  ...STATE_GUIDES,
];

export function findGuide(id: string): Guide | undefined {
  return GUIDES.find((g) => g.id === id);
}
