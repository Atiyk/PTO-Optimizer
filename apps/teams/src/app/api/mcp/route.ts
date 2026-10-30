import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { CapabilityError } from '@/capabilities/errors';
import { authenticateBearer } from '@/lib/agentAuth';
import { bearerChallenge } from '@/lib/resourceMetadata';
import { mcpHandler, toAuthInfo } from '@/server/mcp';

export const dynamic = 'force-dynamic';

async function handle(request: NextRequest) {
  const db = await getDb();
  let auth;
  try {
    auth = await authenticateBearer(db, request.headers.get('authorization'), new Date());
  } catch (err) {
    const e = err instanceof CapabilityError ? err : new CapabilityError('unauthenticated', 'Authentication failed.');
    return NextResponse.json(e.toJSON(), {
      status: e.status,
      headers: e.status === 401 ? { 'WWW-Authenticate': bearerChallenge(request.headers.get('authorization') ? 'invalid_token' : null, e.message) } : {},
    });
  }
  const token = request.headers.get('authorization')!.replace(/^Bearer\s+/i, '');
  return mcpHandler.fetch(request, { authInfo: toAuthInfo(auth, token) });
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
