'use server';

import { cookies } from 'next/headers';
import type { CapabilityInput } from '@/capabilities/registry';
import { SESSION_COOKIE } from '@/lib/session';
import { runForSession, toActionResult } from '@/server/run';

export async function getMyBalanceAction(input: CapabilityInput<'getMyBalance'> = {}) {
  const session = (await cookies()).get(SESSION_COOKIE)?.value;
  return toActionResult(runForSession('getMyBalance', session, input));
}
