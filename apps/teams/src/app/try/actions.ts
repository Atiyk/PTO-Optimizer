'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { SANDBOX_TTL_MS, SandboxFullError, startSandbox, type SandboxKind, type SandboxView } from '@/demo/sandbox';
import { cookieOptions, encodeSession, SESSION_COOKIE } from '@/lib/session';

const LANDING: Record<`${SandboxKind}:${SandboxView}`, string> = {
  'centre:manager': '/app/coverage',
  'centre:staff': '/m',
  'company:manager': '/app/planner',
  'company:staff': '/app',
};

/** One click from the landing page: a private copy of a made-up org, signed in, no Slack. */
export async function startDemo(formData: FormData) {
  const kind: SandboxKind = formData.get('kind') === 'company' ? 'company' : 'centre';
  const view: SandboxView = formData.get('view') === 'staff' ? 'staff' : 'manager';
  let signedIn: { orgId: string; memberId: string };
  try {
    signedIn = await startSandbox(await getDb(), kind, view, new Date());
  } catch (e) {
    if (e instanceof SandboxFullError) redirect('/try?busy=1');
    throw e;
  }
  (await cookies()).set(SESSION_COOKIE, encodeSession({ ...signedIn, issuedAt: Math.floor(Date.now() / 1000) }), cookieOptions(SANDBOX_TTL_MS / 1000));
  redirect(LANDING[`${kind}:${view}`]);
}
