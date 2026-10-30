import 'server-only';
import { getDb } from '@/db/client';
import { CapabilityError } from '@/capabilities/errors';
import { getCapability, invokeCapability, type CapabilityName, type CapabilityOutput } from '@/capabilities/registry';
import { consumeRate } from './rateLimit';
import { humanActorFromSession } from '@/lib/actor';
import { decodeSession } from '@/lib/session';

/** Run a capability as the signed-in human. Shared by server actions and REST routes. */
export async function runForSession<N extends CapabilityName>(
  name: N,
  sessionCookie: string | undefined,
  input: unknown,
): Promise<CapabilityOutput<N>> {
  // Reject a missing or forged cookie before touching the database.
  if (!decodeSession(sessionCookie)) throw new CapabilityError('unauthenticated', 'Sign in first.');
  const db = await getDb();
  const actor = await humanActorFromSession(db, sessionCookie);
  if (!actor) throw new CapabilityError('unauthenticated', 'Sign in first.');
  const now = new Date();
  // People get the same per-minute limits as agent tokens, counted per member.
  const cap = getCapability(name);
  if (cap) await consumeRate(db, `member:${actor.memberId}`, cap.rateLimit, now);
  return invokeCapability(name, { db, actor, now }, input);
}

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } };

/** Server actions return a result union rather than throwing across the network boundary. */
export async function toActionResult<T>(p: Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await p };
  } catch (err) {
    if (err instanceof CapabilityError) return { ok: false, error: { code: err.code, message: err.message } };
    console.error('unhandled action error', err instanceof Error ? err.name : 'unknown');
    return { ok: false, error: { code: 'internal', message: 'Internal error.' } };
  }
}
