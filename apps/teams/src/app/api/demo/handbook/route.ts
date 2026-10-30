import { z } from 'zod';
import { getDb } from '@/db/client';
import { CapabilityError } from '@/capabilities/errors';
import { clientIp } from '@/lib/clientIp';
import { errorResponse } from '@/lib/http';
import { demoReadHandbook, DEMO_HANDBOOK } from '@/demo/demo';
import { sameOrigin } from '@/lib/sameOrigin';
import { consumeRate } from '@/server/rateLimit';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const body = z.object({ text: z.string().min(20).max(20_000).optional() });

/** Public demo: read a handbook as the sample org's admin. Nothing is saved; AI spend is capped by the demo org's daily budget. */
export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) throw new CapabilityError('forbidden', 'Cross-site request refused.');
    const parsed = body.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) throw new CapabilityError('invalid_input', 'Paste between 20 and 20,000 characters of handbook text.');
    const db = await getDb();
    const now = new Date();
    await consumeRate(db, `demo:${clientIp(request.headers)}`, 'ai', now);
    return Response.json(await demoReadHandbook(db, parsed.data.text ?? DEMO_HANDBOOK, now));
  } catch (err) {
    return errorResponse(err);
  }
}
