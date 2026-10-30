import { NextResponse, type NextRequest } from 'next/server';
import { CapabilityError } from '@/capabilities/errors';
import { getCapability, type CapabilityName } from '@/capabilities/registry';
import { errorResponse } from '@/lib/http';
import { SESSION_COOKIE } from '@/lib/session';
import { runForSession } from '@/server/run';

/*
 * Generic REST surface over the registry: POST /api/v1/actions/{capability} with a JSON
 * body. Phase 2 authenticates with the session cookie; Phase 5 adds API keys/OAuth and the
 * OpenAPI document. Same pipeline as every other surface.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    const cap = getCapability(name);
    if (!cap || !(cap.surfaces as readonly string[]).includes('rest')) throw new CapabilityError('not_found', `Unknown action "${name}".`);
    // Browsers send Origin on cross-site POSTs; refuse them (CSRF) when authenticated by cookie.
    const origin = request.headers.get('origin');
    if (origin && origin !== request.nextUrl.origin) throw new CapabilityError('forbidden', 'Cross-site request refused.');
    let body: unknown = {};
    const text = await request.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new CapabilityError('invalid_input', 'Body must be JSON.');
      }
    }
    const data = await runForSession(name as CapabilityName, request.cookies.get(SESSION_COOKIE)?.value, body);
    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}
