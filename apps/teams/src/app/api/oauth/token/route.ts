import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { oauthClients, organizations } from '@/db/schema';
import { mintAgentToken } from '@/capabilities/actions/agents';
import { SCOPES } from '@/capabilities/scopes';
import { hashToken } from '@/lib/tokens';
import { mcpResourceUrl } from '@/lib/resourceMetadata';
import { consumeRate } from '@/server/rateLimit';

/*
 * OAuth 2.0 client-credentials grant (RFC 6749 §4.4) for service agents such as Agentforce.
 * Client authentication: HTTP Basic or client_secret_post. Issues an opaque bearer token
 * (stored hashed) valid for one hour; scopes are the client's, optionally narrowed by `scope`.
 * Errors use the RFC 6749 §5.2 shape.
 */
const ACCESS_TTL_S = 3600;
const oauthError = (error: string, description: string, status = 400) =>
  NextResponse.json({ error, error_description: description }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: NextRequest) {
  const now = new Date();
  const form = new URLSearchParams(await request.text());
  let clientId = form.get('client_id');
  let secret = form.get('client_secret');
  const basic = request.headers.get('authorization')?.match(/^Basic\s+(.+)$/i);
  if (basic) {
    const [id, sec] = Buffer.from(basic[1]!, 'base64').toString('utf8').split(':');
    clientId = decodeURIComponent(id ?? '');
    secret = decodeURIComponent(sec ?? '');
  }
  if (form.get('grant_type') !== 'client_credentials') return oauthError('unsupported_grant_type', 'Only client_credentials is supported here.');
  if (!clientId || !secret) return oauthError('invalid_client', 'Client authentication failed.', 401);
  const db = await getDb();
  try {
    await consumeRate(db, `oauth:${clientId}`, 'auth', now);
  } catch {
    return oauthError('slow_down', 'Too many token requests; retry in a minute.', 429);
  }
  const [c] = await db.select().from(oauthClients).where(and(eq(oauthClients.clientId, clientId), isNull(oauthClients.revokedAt)));
  if (!c || c.secretHash !== hashToken(secret)) return oauthError('invalid_client', 'Client authentication failed.', 401);
  const [org] = await db.select({ on: organizations.agentAccessEnabled }).from(organizations).where(eq(organizations.id, c.orgId));
  if (!org?.on) return oauthError('access_denied', 'An admin has turned off agent access for this organization.', 403);
  const resource = form.get('resource');
  if (resource && resource.replace(/\/$/, '') !== mcpResourceUrl() && !resource.startsWith(`${mcpResourceUrl().replace('/api/mcp', '')}/api/v1`)) {
    return oauthError('invalid_target', 'Unknown resource.');
  }
  const requested = form.get('scope')?.split(/\s+/).filter(Boolean) ?? c.scopes;
  const scopes = requested.filter((s) => c.scopes.includes(s) && (SCOPES as readonly string[]).includes(s));
  if (scopes.length === 0) return oauthError('invalid_scope', `Allowed scopes: ${c.scopes.join(' ')}`);
  const { token } = await mintAgentToken(db, {
    orgId: c.orgId, kind: 'access', name: `${c.name} access token`, scopes, memberId: null, clientId: c.clientId, createdBy: null,
    expiresAt: new Date(now.getTime() + ACCESS_TTL_S * 1000),
  });
  await db.update(oauthClients).set({ lastUsedAt: now }).where(eq(oauthClients.id, c.id));
  return NextResponse.json(
    { access_token: token, token_type: 'Bearer', expires_in: ACCESS_TTL_S, scope: scopes.join(' ') },
    { headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' } },
  );
}
