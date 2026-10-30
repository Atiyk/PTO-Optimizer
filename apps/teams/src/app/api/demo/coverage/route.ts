import { z } from 'zod';
import { getDb } from '@/db/client';
import { CapabilityError } from '@/capabilities/errors';
import { clientIp } from '@/lib/clientIp';
import { errorResponse } from '@/lib/http';
import { demoCallOff, demoRuleDraft, DEMO_REGULATION } from '@/demo/coverageDemo';
import { sameOrigin } from '@/lib/sameOrigin';
import { consumeRate } from '@/server/rateLimit';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const body = z.discriminatedUnion('step', [
  z.object({ step: z.literal('rules'), text: z.string().min(20).max(20_000).optional() }),
  z.object({ step: z.literal('calloff') }),
]);

/** Public coverage demo: draft rules from pasted text, or run the call-off walkthrough. Nothing is saved. */
export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) throw new CapabilityError('forbidden', 'Cross-site request refused.');
    const parsed = body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new CapabilityError('invalid_input', 'Paste between 20 and 20,000 characters of regulation text.');
    const db = await getDb();
    const now = new Date();
    await consumeRate(db, `demo:${clientIp(request.headers)}`, parsed.data.step === 'rules' ? 'ai' : 'write', now);
    if (parsed.data.step === 'rules') return Response.json(await demoRuleDraft(db, parsed.data.text ?? DEMO_REGULATION, now));
    return Response.json(await demoCallOff(db, now));
  } catch (err) {
    return errorResponse(err);
  }
}
