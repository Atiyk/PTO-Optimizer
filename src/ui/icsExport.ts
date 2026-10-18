import type { Break } from '../solver/types';
import { parseISO } from '../solver/dateUtils';
import { formatDateRange } from './dateFormat';

/** RFC 5545 TEXT escaping: backslash, comma, semicolon, and newline must be escaped. */
function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
}

/** Folds a content line to at most 75 octets per RFC 5545 §3.1, continuing with CRLF + a
 * single leading space. Our fields are short in practice; this is a correctness guard for
 * unusually long holiday names or break spans, not something normal plans will trigger. */
function foldLine(line: string): string {
  const CRLF = '\r\n';
  if (line.length <= 75) return line;
  let out = line.slice(0, 75);
  let rest = line.slice(75);
  while (rest.length > 0) {
    const chunk = rest.slice(0, 74); // 74, since the continuation's leading space counts too
    out += CRLF + ' ' + chunk;
    rest = rest.slice(74);
  }
  return out;
}

function isoToICSDate(iso: string): string {
  const { y, m, d } = parseISO(iso);
  return `${String(y).padStart(4, '0')}${String(m).padStart(2, '0')}${String(d).padStart(2, '0')}`;
}

function addOneDayICS(icsDate: string): string {
  const y = Number(icsDate.slice(0, 4));
  const m = Number(icsDate.slice(4, 6));
  const d = Number(icsDate.slice(6, 8));
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return `${String(next.getUTCFullYear()).padStart(4, '0')}${String(next.getUTCMonth() + 1).padStart(2, '0')}${String(next.getUTCDate()).padStart(2, '0')}`;
}

function dtstampNow(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

/**
 * One all-day VEVENT per suggested-PTO day (not per break - a break's weekends/holidays
 * aren't PTO and get no event), titled "PTO" plus that day's break's overall date range so
 * every event in a multi-day break reads the same, recognisable title. All-day events use
 * DTEND exclusive (the day after), per RFC 5545.
 */
export function generateICS(breaks: Break[], isPtoDay: (iso: string) => boolean, now: Date = new Date()): string {
  const lines: string[] = [];
  lines.push('BEGIN:VCALENDAR');
  lines.push('VERSION:2.0');
  lines.push('PRODID:-//PTO Optimizer//EN');
  lines.push('CALSCALE:GREGORIAN');

  const dtstamp = dtstampNow(now);

  for (const brk of breaks) {
    const title = `PTO (${formatDateRange(brk.start, brk.end)})`;
    for (const day of brk.days) {
      if (!isPtoDay(day)) continue;
      const dateStart = isoToICSDate(day);
      const dateEnd = addOneDayICS(dateStart);
      lines.push('BEGIN:VEVENT');
      lines.push(foldLine(`UID:pto-${dateStart}@pto-optimizer.app`));
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART;VALUE=DATE:${dateStart}`);
      lines.push(`DTEND;VALUE=DATE:${dateEnd}`);
      lines.push(foldLine(`SUMMARY:${escapeText(title)}`));
      lines.push('TRANSP:TRANSPARENT');
      lines.push('END:VEVENT');
    }
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function downloadICS(breaks: Break[], isPtoDay: (iso: string) => boolean, filename = 'pto-plan.ics'): void {
  const content = generateICS(breaks, isPtoDay);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
