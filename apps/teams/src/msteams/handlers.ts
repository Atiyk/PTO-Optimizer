import { createHash } from 'node:crypto';
import type { Db } from '@/db/client';
import { CapabilityError } from '@/capabilities/errors';
import { getCapability, invokeCapability, type CapabilityName, type CapabilityOutput } from '@/capabilities/registry';
import type { Actor } from '@/capabilities/types';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { appUrl } from '@/lib/appUrl';
import { consumeRate } from '@/server/rateLimit';
import { amount, day, range } from '@/slack/format';
import { orgForTenant, teamsActor, tenantOf, type Activity } from './actor';
import { sendActivity, updateActivity, type OutActivity } from './api';
import { confirmRequestCard, md, TEAMS_HELP, text } from './cards';

/*
 * Thin adapter (R1), the Teams twin of slack/handlers: every business step is a capability call
 * as the Teams user's member, with the web's rate limits. Chat apps share the `slack` surface
 * flag ("exposed to chat apps"). No leave logic lives here.
 */

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

async function runAs<N extends CapabilityName>(db: Db, actor: Actor, name: N, input: unknown, now: Date): Promise<CapabilityOutput<N>> {
  const cap = getCapability(name);
  if (!cap || !(cap.surfaces as readonly string[]).includes('slack')) throw new CapabilityError('not_found', `Unknown action "${name}".`);
  await consumeRate(db, `member:${actor.memberId}`, cap.rateLimit, now);
  return invokeCapability(name, { db, actor, now }, input);
}

const errorText = (e: unknown) => (e instanceof CapabilityError ? md(e.message) : 'Something went wrong on our side. Please try again.');

const unlinked = () =>
  text(`I don't know who you are in Days Off yet. Ask your admin to add your work email (the one you use for Teams), or sign in once at ${appUrl()}/signin, then try again.`);

/** Replies in the same conversation; for a card button, replaces the card so it can't be clicked twice. */
async function reply(a: Activity, m: OutActivity, replaceCard = false) {
  if (!a.serviceUrl || !a.conversation) return;
  if (replaceCard && a.replyToId) {
    try {
      await updateActivity(a.serviceUrl, a.conversation.id, a.replyToId, m);
      return;
    } catch {
      // Card can't be updated (too old, other client): fall through to a new message.
    }
  }
  await sendActivity(a.serviceUrl, a.conversation.id, m);
}

export async function processActivity(db: Db, a: Activity, now: Date): Promise<void> {
  const orgId = await orgForTenant(db, tenantOf(a));
  if (a.type === 'conversationUpdate' || a.type === 'installationUpdate') {
    // Installed or added to a 1:1 chat: link the person (saves the conversation for approval cards) and say hello.
    const botAdded = a.membersAdded?.some((m) => m.id === a.recipient?.id) ?? a.type === 'installationUpdate';
    if (!orgId || !botAdded || a.conversation?.conversationType !== 'personal') return;
    const actor = await teamsActor(db, orgId, a);
    await reply(a, actor ? text(`Hi! ${TEAMS_HELP}`) : unlinked());
    return;
  }
  if (a.type !== 'message') return;
  if (!orgId) {
    await reply(a, text(`This Microsoft 365 organization isn't connected to Days Off yet. An admin can connect it in Days Off under Admin, then Policies.`));
    return;
  }
  const actor = await teamsActor(db, orgId, a);
  if (!actor) return reply(a, unlinked());
  const v = a.value;
  if (v && typeof v.daysoff === 'string') return handleSubmit(db, actor, a, v, now);
  return handleText(db, actor, a, (a.text ?? '').replace(/<at>.*?<\/at>/g, '').trim(), now);
}

async function handleSubmit(db: Db, actor: Actor, a: Activity, v: Record<string, unknown>, now: Date) {
  try {
    if (v.daysoff === 'request_cancel') return reply(a, text('Cancelled. Nothing was requested.'), true);
    if (v.daysoff === 'request_confirm') {
      const f = (v.f ?? {}) as Record<string, unknown>;
      const r = await runAs(db, actor, 'submitLeaveRequest', { ...f, hours: f.hours ?? undefined, note: f.note ?? undefined, idempotencyKey: String(v.k ?? '') }, now);
      const what = `${md(r.request.leaveType)}, ${range(r.request.start, r.request.end)}`;
      return reply(a, text(r.request.status === 'approved' ? `✅ ${what}: approved.` : `📤 ${what}: sent for approval. I'll message you when it's decided.`), true);
    }
    if ((v.daysoff === 'approve' || v.daysoff === 'decline') && typeof v.requestId === 'string') {
      const r = await runAs(db, actor, 'decideLeaveRequest', { requestId: v.requestId, decision: v.daysoff }, now);
      const what = `${md(r.request.leaveType)}, ${range(r.request.start, r.request.end)}`;
      return reply(a, text(`${r.request.status === 'approved' ? '✅ Approved' : '❌ Declined'}: ${what}.`), true);
    }
  } catch (e) {
    return reply(a, text(errorText(e)), true);
  }
}

async function handleText(db: Db, actor: Actor, a: Activity, raw: string, now: Date) {
  const lower = raw.toLowerCase();
  const today = isoDate(now);
  try {
    if (lower === '' || lower === 'help') return reply(a, text(TEAMS_HELP));
    if (/^who('?s)?( out)?( today)?$/.test(lower) || /^who( is)? out( this)? week$|^who week$/.test(lower)) {
      const week = lower.includes('week');
      const to = week ? addDays(today, (7 - new Date(`${today}T00:00:00Z`).getUTCDay()) % 7) : today;
      const w = await runAs(db, actor, 'whoIsOut', { from: today, to }, now);
      const teams = w.teams.filter((t) => t.out.length);
      const label = week ? `this week (${range(today, to)})` : `today (${day(today)})`;
      if (!teams.length) return reply(a, text(`Nobody is out ${label}.`));
      return reply(
        a,
        text([`**Out ${label}**`, ...teams.map((t) => `**${md(t.teamName.untrusted_text)}**: ${t.out.map((o) => `${md(o.name.untrusted_text)} (${range(o.start < today ? today : o.start, o.end > to ? to : o.end)})`).join(', ')}`)].join('\n\n')),
      );
    }
    if (/^balance\b/.test(lower)) {
      const b = await runAs(db, actor, 'getMyBalance', { leaveType: 'vacation' }, now);
      const lines = [b.unlimited ? '**Vacation**: unlimited.' : `**Vacation**: ${amount(b.usable ?? b.balance, b.unit)} available now.`];
      if (b.yearEnd?.wouldForfeit) lines.push(`${amount(b.yearEnd.wouldForfeit, b.unit)} would be lost after ${day(b.yearEnd.date)}; plan some time off.`);
      return reply(a, text(lines.join('\n\n')));
    }
    // A request in their own words: the same pipeline as the web form and Slack.
    const parsed = await runAs(db, actor, 'parseLeaveRequestText', { text: raw.slice(0, 500) }, now);
    const f = parsed.fields;
    if (f.clarifyingQuestion || !f.start || !f.end || !parsed.evaluation) {
      return reply(a, text(md(f.clarifyingQuestion ?? 'Which dates? For example "Dec 22 to Jan 2" or "Friday afternoon".')));
    }
    const fields = { leaveType: f.leaveType ?? 'vacation', start: f.start, end: f.end, part: f.part, hours: f.hours, note: f.note };
    const typeName = fields.leaveType.charAt(0).toUpperCase() + fields.leaveType.slice(1).replace(/_/g, ' ');
    const key = createHash('sha256').update(`teams:${a.from?.aadObjectId}:${today}:${JSON.stringify(fields)}`).digest('base64url').slice(0, 32);
    return reply(a, confirmRequestCard(fields, parsed.evaluation, typeName, key));
  } catch (e) {
    return reply(a, text(errorText(e)));
  }
}
