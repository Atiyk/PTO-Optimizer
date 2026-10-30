import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { slackInstallations, slackReceipts } from '@/db/schema';
import { CapabilityError } from '@/capabilities/errors';
import { getCapability, invokeCapability, type CapabilityName, type CapabilityOutput } from '@/capabilities/registry';
import type { Actor } from '@/capabilities/types';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { appUrl } from '@/lib/appUrl';
import { consumeRate } from '@/server/rateLimit';
import { installationForTeam, slackActor, type Installation } from './actor';
import { respond, slackApi } from './api';
import { amount, approvalMessage, confirmRequestMessage, day, esc, HELP, range, whoIsOutText, type PendingItem } from './format';

/*
 * Thin adapter (R1): every business step is a capability call as the Slack user's member, with
 * the same rate limits as the web. No leave logic lives here.
 */

type Message = { text: string; blocks?: Record<string, unknown>[] };
type Reply = (m: Message) => Promise<void>;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

async function runAs<N extends CapabilityName>(db: Db, actor: Actor, name: N, input: unknown, now: Date): Promise<CapabilityOutput<N>> {
  const cap = getCapability(name);
  if (!cap || !(cap.surfaces as readonly string[]).includes('slack')) throw new CapabilityError('not_found', `Unknown action "${name}".`);
  await consumeRate(db, `member:${actor.memberId}`, cap.rateLimit, now);
  return invokeCapability(name, { db, actor, now }, input);
}

const errorText = (e: unknown) => (e instanceof CapabilityError ? esc(e.message) : 'Something went wrong on our side. Please try again.');

/** True the first time a key is seen; Slack retries and double deliveries return false. */
export async function firstReceipt(db: Db, key: string): Promise<boolean> {
  const rows = await db.insert(slackReceipts).values({ key }).onConflictDoNothing().returning({ key: slackReceipts.key });
  return rows.length === 1;
}

const unlinked = (): Message => ({
  text: `I don't know who you are in Days Off yet. Sign in once with Slack at ${appUrl()}/signin to link your account, then try again.`,
});

/** Slash command text and DMs share one path. */
export async function handleText(db: Db, inst: Installation, slackUserId: string, rawText: string, now: Date, reply: Reply): Promise<void> {
  const actor = await slackActor(db, inst, slackUserId);
  if (!actor) return reply(unlinked());
  const text = rawText.trim();
  const lower = text.toLowerCase();
  const today = isoDate(now);
  try {
    if (lower === '' || lower === 'help') return reply({ text: HELP });
    if (/^who('?s)?( out)?( today)?$/.test(lower) || /^who( is)? out( this)? week$|^who week$/.test(lower)) {
      const week = lower.includes('week');
      // This week = today through Sunday.
      const to = week ? addDays(today, (7 - new Date(`${today}T00:00:00Z`).getUTCDay()) % 7) : today;
      const w = await runAs(db, actor, 'whoIsOut', { from: today, to }, now);
      return reply({ text: whoIsOutText(w, today, to) });
    }
    if (/^balance\b/.test(lower)) {
      const b = await runAs(db, actor, 'getMyBalance', { leaveType: 'vacation' }, now);
      const lines = [`*Vacation*: ${amount(b.usable ?? b.balance, b.unit)} available now.`];
      if (b.yearEnd?.wouldForfeit) lines.push(`${amount(b.yearEnd.wouldForfeit, b.unit)} would be lost after ${day(b.yearEnd.date)}; plan some time off.`);
      return reply({ text: lines.join('\n') });
    }
    // Anything else is a request in their own words (the same pipeline as the web form, 3A).
    const parsed = await runAs(db, actor, 'parseLeaveRequestText', { text: text.slice(0, 500) }, now);
    const f = parsed.fields;
    if (f.clarifyingQuestion || !f.start || !f.end || !parsed.evaluation) {
      return reply({ text: esc(f.clarifyingQuestion ?? 'Which dates? For example "Dec 22 to Jan 2" or "Friday afternoon".') });
    }
    const fields = { leaveType: f.leaveType ?? 'vacation', start: f.start, end: f.end, part: f.part, hours: f.hours, note: f.note };
    const typeName = fields.leaveType.charAt(0).toUpperCase() + fields.leaveType.slice(1).replace(/_/g, ' ');
    // Same words, same person, same day → same key, so a double click makes one request.
    const key = createHash('sha256').update(`${inst.teamId}:${slackUserId}:${today}:${JSON.stringify(fields)}`).digest('base64url').slice(0, 32);
    return reply(confirmRequestMessage(fields, parsed.evaluation, typeName, JSON.stringify({ f: fields, k: key })));
  } catch (e) {
    return reply({ text: errorText(e) });
  }
}

export interface SlashCommand {
  team_id: string;
  user_id: string;
  text: string;
  response_url: string;
}

/** Runs after the 3-second ack; answers through response_url (only the caller sees it). */
export async function processCommand(db: Db, cmd: SlashCommand, now: Date): Promise<void> {
  const inst = await installationForTeam(db, cmd.team_id);
  if (!inst) return respond(cmd.response_url, { response_type: 'ephemeral', text: 'Days Off is not installed for this workspace.' });
  await handleText(db, inst, cmd.user_id, cmd.text, now, (m) => respond(cmd.response_url, { response_type: 'ephemeral', ...m }));
}

export interface BlockActions {
  type: 'block_actions';
  team: { id: string };
  user: { id: string };
  response_url: string;
  actions: { action_id: string; value?: string }[];
}

export async function processInteraction(db: Db, p: BlockActions, now: Date): Promise<void> {
  const inst = await installationForTeam(db, p.team.id);
  const a = p.actions[0];
  if (!inst || !a) return;
  const replace = (m: Message) => respond(p.response_url, { replace_original: true, ...m });
  if (a.action_id === 'request_cancel') return respond(p.response_url, { delete_original: true });
  const actor = await slackActor(db, inst, p.user.id);
  if (!actor) return replace(unlinked());
  try {
    if (a.action_id === 'request_confirm') {
      const { f, k } = JSON.parse(a.value ?? '{}') as { f: Record<string, unknown>; k: string };
      const r = await runAs(db, actor, 'submitLeaveRequest', { ...f, hours: f.hours ?? undefined, note: f.note ?? undefined, idempotencyKey: k }, now);
      const what = `${esc(r.request.leaveType)}, ${range(r.request.start, r.request.end)}`;
      return replace({ text: r.request.status === 'approved' ? `:white_check_mark: ${what}: approved.` : `:outbox_tray: ${what}: sent for approval. I'll message you when it's decided.` });
    }
    if (a.action_id === 'approve' || a.action_id === 'decline') {
      const r = await runAs(db, actor, 'decideLeaveRequest', { requestId: a.value, decision: a.action_id }, now);
      const what = `${esc(r.request.leaveType)}, ${range(r.request.start, r.request.end)}`;
      return replace({ text: `${r.request.status === 'approved' ? ':white_check_mark: Approved' : ':x: Declined'}: ${what}.` });
    }
  } catch (e) {
    return replace({ text: errorText(e) });
  }
}

export interface EventCallback {
  type: 'event_callback';
  team_id: string;
  event_id: string;
  event: { type: string; channel_type?: string; user?: string; text?: string; channel?: string; bot_id?: string; subtype?: string };
}

export async function processEvent(db: Db, body: EventCallback, now: Date): Promise<void> {
  const e = body.event;
  if (e.type === 'app_uninstalled' || e.type === 'tokens_revoked') {
    await db.delete(slackInstallations).where(eq(slackInstallations.teamId, body.team_id));
    return;
  }
  // DMs to the bot from a person (not our own posts, not edits or joins).
  if (e.type !== 'message' || e.channel_type !== 'im' || e.bot_id || e.subtype || !e.user || !e.channel) return;
  const inst = await installationForTeam(db, body.team_id);
  if (!inst) return;
  const channel = e.channel;
  await handleText(db, inst, e.user, e.text ?? '', now, async (m) => {
    await slackApi('chat.postMessage', inst.token, { channel, ...m });
  });
}

/** The approval message for one pending request, as the approver would see it in the web queue. */
export function approvalFor(items: PendingItem[], requestId: string) {
  const r = items.find((x) => x.id === requestId);
  return r ? approvalMessage(r) : null;
}
