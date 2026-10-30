import 'server-only';
import { getDb } from '@/db/client';
import { CapabilityError } from '@/capabilities/errors';
import { invokeCapability, type CapabilityName, type CapabilityOutput } from '@/capabilities/registry';
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
  return invokeCapability(name, { db, actor, now: new Date() }, input);
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
