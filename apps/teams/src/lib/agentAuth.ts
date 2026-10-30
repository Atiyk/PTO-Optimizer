import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { apiTokens, members, organizations } from '@/db/schema';
import { CapabilityError } from '@/capabilities/errors';
import { ROLE_SCOPES, SCOPES, type Scope } from '@/capabilities/scopes';
import type { Actor } from '@/capabilities/types';
import { hashToken } from './tokens';

/** Token prefixes: dok_ org API key, dop_ personal access token, doa_ client-credentials access token. */
export const TOKEN_PREFIX = { api_key: 'dok', pat: 'dop', access: 'doa' } as const;

export interface AgentAuth {
  actor: Actor;
  tokenId: string;
}

/**
 * Resolves `Authorization: Bearer <token>` to an agent actor (R3). Personal tokens act on
 * behalf of their member with at most that member's current role scopes; API keys and
 * client-credentials tokens are service agents with no member identity. The org's kill
 * switch refuses every agent token at once; humans are unaffected.
 */
/**
 * The credential an agent sent: `Authorization: Bearer <token>`, or `X-API-Key: <token>` for
 * platforms whose API-key setting only names a header (Copilot Studio). Never the query string.
 */
export function credentialHeader(headers: Headers): string | null {
  const authz = headers.get('authorization');
  if (authz) return authz;
  const key = headers.get('x-api-key')?.trim();
  return key ? `Bearer ${key}` : null;
}

export async function authenticateBearer(db: Db, header: string | null, now: Date): Promise<AgentAuth> {
  const m = header?.match(/^Bearer\s+(\S+)$/i);
  if (!m) throw new CapabilityError('unauthenticated', 'Send an access token: Authorization: Bearer <token>.');
  const [row] = await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, hashToken(m[1]!)));
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt <= now)) {
    throw new CapabilityError('unauthenticated', 'This token is invalid, expired or revoked.');
  }
  const [org] = await db.select({ agentAccessEnabled: organizations.agentAccessEnabled }).from(organizations).where(eq(organizations.id, row.orgId));
  if (!org?.agentAccessEnabled) throw new CapabilityError('forbidden', 'An admin has turned off agent access for this organization.');

  const tokenScopes = row.scopes.filter((s): s is Scope => (SCOPES as readonly string[]).includes(s));
  let actor: Actor;
  if (row.kind === 'pat') {
    const [mem] = await db
      .select({ id: members.id, role: members.role })
      .from(members)
      .where(and(eq(members.id, row.memberId!), eq(members.orgId, row.orgId), isNull(members.deletedAt)));
    if (!mem) throw new CapabilityError('unauthenticated', 'The member this token belongs to no longer exists.');
    const allowed = ROLE_SCOPES[mem.role];
    actor = {
      type: 'agent-on-behalf-of-user',
      orgId: row.orgId,
      memberId: null,
      role: mem.role,
      clientId: row.clientId,
      onBehalfOfMemberId: mem.id,
      scopes: tokenScopes.filter((s) => allowed.includes(s)),
    };
  } else {
    // Service agents never get admin or approval powers (they have no person behind them).
    actor = {
      type: 'service-agent',
      orgId: row.orgId,
      memberId: null,
      role: null,
      clientId: row.clientId,
      onBehalfOfMemberId: null,
      scopes: tokenScopes.filter((s) => s !== 'admin' && s !== 'leave:approve'),
    };
  }
  // Last-used tracking, at most once a minute per token.
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > 60_000) {
    await db.update(apiTokens).set({ lastUsedAt: now }).where(eq(apiTokens.id, row.id));
  }
  return { actor, tokenId: row.id };
}
