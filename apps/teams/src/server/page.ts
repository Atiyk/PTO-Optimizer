import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { invokeCapability, type CapabilityInput, type CapabilityName, type CapabilityOutput } from '@/capabilities/registry';
import type { Actor } from '@/capabilities/types';
import { humanActorFromSession } from '@/lib/actor';
import { SESSION_COOKIE } from '@/lib/session';

/** For server components: the signed-in human, or a redirect to sign in. */
export async function requireActor(): Promise<Actor> {
  const db = await getDb();
  const actor = await humanActorFromSession(db, (await cookies()).get(SESSION_COOKIE)?.value);
  if (!actor) redirect('/signin');
  return actor;
}

/** Call a capability as the signed-in human from a server component. */
export async function call<N extends CapabilityName>(name: N, input: CapabilityInput<N>, actor?: Actor): Promise<CapabilityOutput<N>> {
  const db = await getDb();
  const a = actor ?? (await requireActor());
  return invokeCapability(name, { db, actor: a, now: new Date() }, input);
}
