/**
 * Turns the two calendar feeds the app already serves (the plan feed's "book by" reminders
 * and the expiry watch feed's 60/30/7-day reminders) into one daily email. An item is due
 * when one of its calendar alarms falls on `today`, so the email and the calendar always
 * agree, and nothing about the plan is computed twice.
 */
export interface DueItem { date: string; summary: string; description: string }

function unfold(ics: string): string[] {
  return ics.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
}

function unescapeText(text: string): string {
  return text.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
}

function addDaysISO(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** The calendar day an alarm fires on, for an all-day event starting at local midnight. */
export function alarmDate(startISO: string, trigger: string): string | null {
  const match = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(trigger.trim());
  if (!match) return null;
  const sign = match[1] === '-' ? -1 : 1;
  const [weeks, days, hours, minutes, seconds] = match.slice(2).map((part) => Number(part ?? 0));
  const totalSeconds = sign * ((((weeks * 7 + days) * 24 + hours) * 60 + minutes) * 60 + seconds);
  return addDaysISO(startISO, Math.floor(totalSeconds / 86400));
}

export function dueItems(ics: string, today: string): DueItem[] {
  const items: DueItem[] = [];
  let event: { start?: string; summary?: string; description?: string; triggers: string[] } | null = null;
  let inAlarm = false;
  for (const line of unfold(ics)) {
    if (line === 'BEGIN:VEVENT') { event = { triggers: [] }; continue; }
    if (!event) continue;
    if (line === 'BEGIN:VALARM') { inAlarm = true; continue; }
    if (line === 'END:VALARM') { inAlarm = false; continue; }
    if (line === 'END:VEVENT') {
      const { start, summary } = event;
      if (start && summary && event.triggers.some((trigger) => alarmDate(start, trigger) === today)) {
        items.push({ date: start, summary, description: event.description ?? '' });
      }
      event = null;
      continue;
    }
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const name = line.slice(0, colon).split(';')[0].toUpperCase();
    const value = line.slice(colon + 1);
    if (inAlarm) {
      if (name === 'TRIGGER' && !/VALUE=DATE-TIME/i.test(line.slice(0, colon))) event.triggers.push(value);
    } else if (name === 'DTSTART' && /^\d{8}/.test(value)) {
      event.start = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
    } else if (name === 'SUMMARY') event.summary = unescapeText(value);
    else if (name === 'DESCRIPTION') event.description = unescapeText(value);
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.summary.localeCompare(b.summary));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function compact(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export interface DigestLinks { planUrl?: string; policyUrl?: string; unsubscribeUrl: string; accountUrl: string }

export function reminderEmail(items: readonly DueItem[], links: DigestLinks): { subject: string; text: string } {
  const subject = items.length === 1 ? `Gapless reminder: ${items[0].summary}` : `Gapless: ${items.length} time-off reminders for today`;
  const body = items.map((item) => `- ${item.summary} (${compact(item.date)})\n  ${item.description.replace(/\n+/g, ' ').trim()}`);
  const open = [
    links.planUrl ? `Open your plan: ${links.planUrl}` : null,
    links.policyUrl ? `Open your policy: ${links.policyUrl}` : null,
  ].filter(Boolean);
  return {
    subject,
    text: [
      'Hi,', '', 'Here is what is due today:', '', ...body, '', ...open, '',
      'You get this email because you turned on reminder emails in Gapless.',
      `Stop these emails: ${links.unsubscribeUrl}`,
      `Manage or delete your account: ${links.accountUrl}`,
    ].join('\n'),
  };
}
