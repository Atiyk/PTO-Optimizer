import type { PendingItem, Evaluation, Fields } from '@/slack/format';
import { amount, checkLines, day, range, RECOMMENDATION_TEXT } from '@/slack/format';
import type { OutActivity } from './api';

/*
 * Teams messages: Adaptive Cards (schema 1.4) and markdown text. Everything people typed is
 * escaped so it can't become formatting or a link; every number comes from the engine.
 */

/** Escapes Teams markdown so user text stays literal. */
export const md = (s: string) => s.replace(/[\\`*_{}[\]()#+\-.!|<>~]/g, (c) => `\\${c}`);
const nm = (u: { untrusted_text: string } | null | undefined) => md(u?.untrusted_text ?? '');
const PART: Record<string, string> = { am: ' (morning)', pm: ' (afternoon)', hours: ' (hours)', full: '' };

export const text = (t: string): OutActivity => ({ type: 'message', text: t, textFormat: 'markdown' });

function card(body: unknown[], actions: unknown[] = []): OutActivity {
  return {
    type: 'message',
    attachments: [
      {
        contentType: 'application/vnd.microsoft.card.adaptive',
        content: { type: 'AdaptiveCard', $schema: 'http://adaptivecards.io/schemas/adaptive-card.json', version: '1.4', body, actions },
      },
    ],
  };
}
const tb = (t: string, extra: Record<string, unknown> = {}) => ({ type: 'TextBlock', text: t, wrap: true, ...extra });

/** The approver's card: the same impact facts as the web queue, then Approve / Decline. */
export function approvalCard(r: PendingItem, lead?: string): OutActivity {
  const i = r.impact;
  const lines: Record<string, unknown>[] = [tb(`**${nm(r.member.name)}** asks for **${md(r.leaveType)}**, ${range(r.start, r.end)}${PART[r.part] ?? ''} · ${amount(r.deducts, i.unit)}`)];
  if (lead) lines.unshift(tb(md(lead), { isSubtle: true }));
  if (r.decision?.recommendation) lines.push(tb(`**${RECOMMENDATION_TEXT[r.decision.recommendation]}**${r.decision.wouldAutoApprove ? ' (meets the auto-approval rules)' : ''}`));
  if (i.balanceAfter != null) lines.push(tb(`Balance after: ${amount(i.balanceAfter, i.unit)}${i.yearEndForfeit ? ` · would still lose ${amount(i.yearEndForfeit, i.unit)} at year end` : ''}`));
  const tight = i.coverage.filter((c) => c.present < c.required);
  lines.push(tb(tight.length ? `⚠️ Coverage short on ${tight.map((c) => `${day(c.date)} (${c.present}/${c.required}${c.tag ? ` ${md(c.tag)}` : ''})`).join(', ')}` : 'Coverage: fine on every day'));
  if (i.overlapping.length) lines.push(tb(`Also out: ${i.overlapping.map((o) => `${nm(o.member)} (${range(o.start, o.end)}${o.status === 'pending' ? ', pending' : ''})`).join(', ')}`));
  for (const c of checkLines(r)) lines.push(tb(md(c)));
  if (r.retroactive) lines.push(tb('This is for past dates.'));
  if (r.note) lines.push(tb(`Note: "${nm(r.note)}"`, { isSubtle: true }));
  lines.push({
    type: 'Input.ChoiceSet',
    id: 'reason',
    label: 'If you decline, why?',
    value: 'coverage',
    choices: [
      { title: 'Not enough cover', value: 'coverage' },
      { title: 'Not enough notice', value: 'notice' },
      { title: 'Busy period', value: 'peak_period' },
    ],
  });
  return card(lines, [
    { type: 'Action.Submit', title: 'Approve', style: 'positive', data: { daysoff: 'approve', requestId: r.id } },
    { type: 'Action.Submit', title: 'Decline', style: 'destructive', data: { daysoff: 'decline', requestId: r.id } },
  ]);
}

/** The confirm card for a request typed in words: engine numbers, then Request / Cancel. */
export function confirmRequestCard(f: Fields, ev: Evaluation, typeName: string, key: string): OutActivity {
  const lines = [tb(`**${md(typeName)}**, ${range(f.start, f.end)}${PART[f.part] ?? ''}${f.part === 'hours' && f.hours ? ` · ${f.hours} h` : ''}`)];
  if (ev.countsAgainstBalance) lines.push(tb(`Uses **${amount(ev.deducts, ev.unit)}**${ev.balanceAfter != null ? ` · leaves **${amount(ev.balanceAfter, ev.unit)}**` : ''}`));
  const holidays = ev.excluded.filter((x) => x.reason === 'holiday');
  if (holidays.length) lines.push(tb(`Not deducted: ${holidays.map((h) => `${md(h.name ?? 'holiday')} (${day(h.date)})`).join(', ')}`));
  for (const w of ev.warnings) lines.push(tb(`⚠️ ${md(w)}`));
  for (const p of ev.problems) lines.push(tb(`⛔ ${md(p)}`, { color: 'attention' }));
  return card(
    lines,
    ev.canSubmit
      ? [
          { type: 'Action.Submit', title: 'Request', style: 'positive', data: { daysoff: 'request_confirm', f, k: key } },
          { type: 'Action.Submit', title: 'Cancel', data: { daysoff: 'request_cancel' } },
        ]
      : [],
  );
}

export const TEAMS_HELP = [
  '**Days Off** in Teams:',
  '- Type a request in your own words, like "Friday afternoon off" or "Dec 22 to Jan 2"',
  "- **who**: who's out today · **who week**: this week",
  '- **balance**: your balance',
  'Approvers get a card with Approve and Decline for each request.',
].join('\n');
