import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { CapabilityError } from '@/capabilities/errors';
import { getCapability, type CapabilityName } from '@/capabilities/registry';
import { authenticateBearer } from '@/lib/agentAuth';
import { errorResponse } from '@/lib/http';
import { bearerChallenge } from '@/lib/resourceMetadata';
import { SESSION_COOKIE } from '@/lib/session';
import { callAsAgent } from '@/server/agentGateway';
import { runForSession } from '@/server/run';

/*
 * REST surface over the registry: POST /api/v1/actions/{capability} with a JSON body.
 * Described by /api/v1/openapi.json. Two ways in:
 *  - Authorization: Bearer <token> (agents): the agent gateway, with rate limits and
 *    draft → confirm for commit actions (HTTP 202 + confirmation details);
 *  - the session cookie (the web app), with a same-origin check against CSRF.
 * Errors: { error: { code, message, details } } with a matching HTTP status.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    const cap = getCapability(name);
    if (!cap || !(cap.surfaces as readonly string[]).includes('rest')) throw new CapabilityError('not_found', `Unknown action "${name}". See /api/v1/openapi.json.`);
    let body: unknown = {};
    const text = await request.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new CapabilityError('invalid_input', 'Body must be JSON.');
      }
    }
    const authz = request.headers.get('authorization');
    if (authz) {
      const db = await getDb();
      let auth;
      try {
        auth = await authenticateBearer(db, authz, new Date());
      } catch (err) {
        const res = errorResponse(err);
        if (res.status === 401) res.headers.set('WWW-Authenticate', bearerChallenge('invalid_token', (err as Error).message));
        return res;
      }
      const r = await callAsAgent(db, auth, name, body, new Date(), 'rest');
      return r.status === 'done' ? NextResponse.json({ data: r.result }) : NextResponse.json({ confirmation: r }, { status: 202 });
    }
    // Browsers send Origin on cross-site POSTs; refuse them (CSRF) when authenticated by cookie.
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) throw new CapabilityError('forbidden', 'Cross-site request refused.');
    const data = await runForSession(name as CapabilityName, request.cookies.get(SESSION_COOKIE)?.value, body);
    return NextResponse.json({ data });
  } catch (err) {
    const res = errorResponse(err);
    if (err instanceof CapabilityError && err.code === 'rate_limited') {
      res.headers.set('Retry-After', String((err.details as { retryAfterSeconds?: number })?.retryAfterSeconds ?? 60));
    }
    return res;
  }
}
