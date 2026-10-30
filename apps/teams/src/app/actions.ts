'use server';

import { cookies } from 'next/headers';
import { getDb } from '@/db/client';
import { CapabilityError } from '@/capabilities/errors';
import { getCapability, invokeCapability, type CapabilityName, type CapabilityOutput } from '@/capabilities/registry';
import { humanActorFromSession } from '@/lib/actor';
import { SESSION_COOKIE } from '@/lib/session';
import { toActionResult, type ActionResult } from '@/server/run';

/**
 * The web UI's single entry point for business actions: any registry capability that lists
 * the 'ui' surface, run as the signed-in human. Same permission and audit pipeline as every
 * other surface (R1). Next.js server actions also check the Origin header (CSRF).
 */
export async function runCapability<N extends CapabilityName>(name: N, input: unknown): Promise<ActionResult<CapabilityOutput<N>>> {
  return toActionResult(
    (async () => {
      const cap = getCapability(name);
      if (!cap || !(cap.surfaces as readonly string[]).includes('ui')) throw new CapabilityError('not_found', 'Unknown action.');
      const db = await getDb();
      const actor = await humanActorFromSession(db, (await cookies()).get(SESSION_COOKIE)?.value);
      if (!actor) throw new CapabilityError('unauthenticated', 'Sign in first.');
      return invokeCapability(name, { db, actor, now: new Date() }, input);
    })(),
  );
}
