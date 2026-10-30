import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { CapabilityError } from '@/capabilities/errors';
import { authenticateBearer, credentialHeader } from '@/lib/agentAuth';
import { errorResponse } from '@/lib/http';
import { confirmDraftAsAgent } from '@/server/agentGateway';

/** POST /api/v1/drafts/{id}/confirm { "confirmationToken": "..." }: an agent confirms after the person agreed (R2). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { confirmationToken?: unknown };
    if (typeof body.confirmationToken !== 'string') throw new CapabilityError('invalid_input', 'confirmationToken is required.');
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new CapabilityError('not_found', 'Draft not found.');
    const db = await getDb();
    const auth = await authenticateBearer(db, credentialHeader(request.headers), new Date());
    const r = await confirmDraftAsAgent(db, auth, id, body.confirmationToken, new Date());
    return NextResponse.json({ data: r.result });
  } catch (err) {
    return errorResponse(err);
  }
}
