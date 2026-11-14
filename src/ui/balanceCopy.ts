import { compactDate } from './compactDate';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** What the forecast will say once there is a balance, in one line, with no invented figure. */
export function blankBalanceMessage(forecastDate: string, balanceAsOf: string): string {
  const when = ISO_DATE.test(forecastDate) && forecastDate >= balanceAsOf ? ` on ${compactDate(forecastDate)}` : '';
  return `Enter your current PTO balance to see how much you will have${when}, after accrual and any time off you have tracked.`;
}
