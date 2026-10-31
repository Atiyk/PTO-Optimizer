/*
 * Slack message text and Block Kit. Everything people typed (names, notes) is escaped so it
 * can't become a mention, a link or formatting, and every number comes from the engine.
 */

type Untrusted = { untrusted_text: string } | null | undefined;
export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const name = (u: Untrusted) => esc(u?.untrusted_text ?? '');

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function day(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}
export const range = (a: string, b: string) => (a === b ? day(a) : `${day(a)} – ${day(b)}`);
const PART: Record<string, string> = { am: ' (morning)', pm: ' (afternoon)', hours: ' (hours)', full: '' };
export const amount = (n: number, unit: string) => `${Number(n.toFixed(2))} ${unit === 'hours' ? (n === 1 ? 'hour' : 'hours') : n === 1 ? 'day' : 'days'}`;

export interface Evaluation {
  leaveType: string;
  unit: 'days' | 'hours';
  deducts: number;
  countsAgainstBalance: boolean;
  balanceAfter: number | null;
  excluded: { date: string; reason: string; name?: string }[];
  problems: string[];
  warnings: string[];
  canSubmit: boolean;
}
export interface Fields {
  leaveType: string;
  start: string;
  end: string;
  part: 'full' | 'am' | 'pm' | 'hours';
  hours?: number | null;
  note?: string | null;
}

/** The confirm message for a request typed in words: engine numbers, then Request / Cancel. */
export function confirmRequestMessage(f: Fields, ev: Evaluation, typeName: string, actionValue: string) {
  const lines = [`*${esc(typeName)}*, ${range(f.start, f.end)}${PART[f.part] ?? ''}${f.part === 'hours' && f.hours ? ` · ${f.hours} h` : ''}`];
  if (ev.countsAgainstBalance) lines.push(`Uses *${amount(ev.deducts, ev.unit)}*${ev.balanceAfter != null ? ` · leaves *${amount(ev.balanceAfter, ev.unit)}*` : ''}`);
  const holidays = ev.excluded.filter((x) => x.reason === 'holiday');
  if (holidays.length) lines.push(`Not deducted: ${holidays.map((h) => `${esc(h.name ?? 'holiday')} (${day(h.date)})`).join(', ')}`);
  for (const w of ev.warnings) lines.push(`:warning: ${esc(w)}`);
  for (const p of ev.problems) lines.push(`:no_entry: ${esc(p)}`);
  const blocks: Record<string, unknown>[] = [{ type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } }];
  if (ev.canSubmit) {
    blocks.push({
      type: 'actions',
      elements: [
        { type: 'button', style: 'primary', text: { type: 'plain_text', text: 'Request' }, action_id: 'request_confirm', value: actionValue },
        { type: 'button', text: { type: 'plain_text', text: 'Cancel' }, action_id: 'request_cancel', value: 'cancel' },
      ],
    });
  }
  return { text: lines[0]!.replace(/\*/g, ''), blocks };
}

export interface PendingItem {
  id: string;
  member: { id: string; name: { untrusted_text: string } };
  leaveType: string;
  start: string;
  end: string;
  part: string;
  deducts: number;
  retroactive: boolean;
  note: { untrusted_text: string } | null;
  impact: {
    balanceAfter: number | null;
    unit: 'days' | 'hours';
    yearEndForfeit: number | null;
    coverage: { date: string; required: number; present: number; tag: string | null }[];
    overlapping: { member: { untrusted_text: string }; start: string; end: string; status: string }[];
  };
  /** The decision packet (0009): every check, the recommendation, the policy. */
  decision?: {
    wouldAutoApprove: boolean;
    checklist: { kind: string; status: 'pass' | 'warn' | 'fail'; message: string }[];
    recommendation: 'approve' | 'look' | 'likely_decline' | null;
    overtimeBand: 'no_overtime' | 'overtime' | 'no_cover' | null;
    policy: { name: string; mode: string };
  };
  changedSinceSubmit?: string[];
  waiting?: { hours: number; escalationLevel: number; overdue: boolean; urgent: boolean; review: boolean };
}

export const RECOMMENDATION_TEXT = { approve: 'Every check passes', look: 'Worth a look', likely_decline: 'Usually a no' } as const;
export const OVERTIME_TEXT = { no_overtime: 'Cover likely without overtime', overtime: 'Cover would mean overtime for someone', no_cover: 'Nobody eligible to cover' } as const;

/** Check lines that are not a plain pass, for the chat cards (the web shows the full list). */
export function checkLines(r: PendingItem): string[] {
  const d = r.decision;
  if (!d) return [];
  const out = d.checklist.filter((c) => c.status !== 'pass' && !['coverage'].includes(c.kind)).map((c) => `${c.status === 'fail' ? '⛔' : '⚠️'} ${c.message}`);
  if (d.overtimeBand) out.push(`${d.overtimeBand === 'no_overtime' ? '✅' : '⚠️'} ${OVERTIME_TEXT[d.overtimeBand]}`);
  for (const c of r.changedSinceSubmit ?? []) out.push(`↻ Changed since submitted: ${c}`);
  return out;
}

/** The approval message: the same impact facts as the web queue, then Approve / Decline. */
export function approvalMessage(r: PendingItem, lead?: string) {
  const i = r.impact;
  const lines = [`*${name(r.member.name)}* asks for *${esc(r.leaveType)}*, ${range(r.start, r.end)}${PART[r.part] ?? ''} · ${amount(r.deducts, i.unit)}`];
  if (lead) lines.unshift(`_${esc(lead)}_`);
  if (r.decision?.recommendation) lines.push(`*${RECOMMENDATION_TEXT[r.decision.recommendation]}*${r.decision.wouldAutoApprove ? ' (meets the auto-approval rules)' : ''}`);
  if (i.balanceAfter != null) lines.push(`Balance after: ${amount(i.balanceAfter, i.unit)}${i.yearEndForfeit ? ` · would still lose ${amount(i.yearEndForfeit, i.unit)} at year end` : ''}`);
  const tight = i.coverage.filter((c) => c.present < c.required);
  lines.push(tight.length ? `:warning: Coverage short on ${tight.map((c) => `${day(c.date)} (${c.present}/${c.required}${c.tag ? ` ${esc(c.tag)}` : ''})`).join(', ')}` : 'Coverage: fine on every day');
  if (i.overlapping.length) lines.push(`Also out: ${i.overlapping.map((o) => `${name(o.member)} (${range(o.start, o.end)}${o.status === 'pending' ? ', pending' : ''})`).join(', ')}`);
  for (const c of checkLines(r)) lines.push(esc(c));
  if (r.retroactive) lines.push('This is for past dates.');
  if (r.note) lines.push(`Note: "${name(r.note)}"`);
  return {
    text: lines[0]!.replace(/\*/g, ''),
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
      {
        type: 'actions',
        elements: [
          { type: 'button', style: 'primary', text: { type: 'plain_text', text: 'Approve' }, action_id: 'approve', value: r.id },
          {
            type: 'static_select',
            action_id: 'decline',
            placeholder: { type: 'plain_text', text: 'Decline because…' },
            options: [
              { text: { type: 'plain_text', text: 'Not enough cover' }, value: `${r.id}|coverage` },
              { text: { type: 'plain_text', text: 'Not enough notice' }, value: `${r.id}|notice` },
              { text: { type: 'plain_text', text: 'Busy period' }, value: `${r.id}|peak_period` },
            ],
          },
        ],
      },
    ],
  };
}

export interface WhoIsOut {
  teams: { teamName: { untrusted_text: string }; out: { name: { untrusted_text: string }; start: string; end: string; part: string; leaveType: string | null }[] }[];
}

/**
 * Who's out, short: one line per team, names and dates only (the incumbent complaint is a
 * wall of text). People out the whole period show "until <end>".
 */
export function whoIsOutText(w: WhoIsOut, from: string, to: string): string {
  const label = from === to ? `today (${day(from)})` : `this week (${range(from, to)})`;
  const teams = w.teams.filter((t) => t.out.length);
  if (!teams.length) return `Nobody is out ${label}.`;
  const who = (o: WhoIsOut['teams'][number]['out'][number]) => {
    const when = from === to ? (o.end > to ? `until ${day(o.end)}` : PART[o.part]?.trim().replace(/[()]/g, '') || 'all day') : range(o.start < from ? from : o.start, o.end > to ? to : o.end);
    return `${name(o.name)} (${when})`;
  };
  return [`*Out ${label}*`, ...teams.map((t) => `*${name(t.teamName)}*: ${t.out.map(who).join(', ')}`)].join('\n');
}

export const HELP = [
  '*Days Off* in Slack:',
  '• `/daysoff Friday afternoon off` or `/daysoff Dec 22 to Jan 2`: request leave in your own words',
  "• `/daysoff who`: who's out today · `/daysoff who week`: this week",
  '• `/daysoff balance`: your balance',
  'You can also DM me the same things.',
].join('\n');

/** A yes/cancel prompt for a drafted action (call-off, cover request). Nothing happens until "yes". */
export function confirmActionMessage(text: string, yes: string, actionId: string, actionValue: string) {
  return {
    text,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text } },
      {
        type: 'actions',
        elements: [
          { type: 'button', style: 'primary', text: { type: 'plain_text', text: yes }, action_id: actionId, value: actionValue },
          { type: 'button', text: { type: 'plain_text', text: 'Cancel' }, action_id: 'request_cancel', value: 'cancel' },
        ],
      },
    ],
  };
}
