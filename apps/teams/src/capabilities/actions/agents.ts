import { and, asc, desc, eq, gte, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { apiTokens, drafts, members, oauthClients, organizations } from '@/db/schema';
import { TOKEN_PREFIX } from '@/lib/agentAuth';
import { newToken } from '@/lib/tokens';
import { CapabilityError } from '../errors';
import { actingMemberId, subjectMember } from '../helpers';
import { ROLE_SCOPES, SCOPES, type Scope } from '../scopes';
import { defineCapability, type CapabilityContext } from '../types';

const scopeList = z.array(z.enum(SCOPES)).min(1).describe(`Scopes: ${SCOPES.join(', ')}.`);
const tokenView = z.object({
  id: z.uuid(),
  kind: z.enum(['api_key', 'pat', 'access']),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.string()),
  memberId: z.uuid().nullable(),
  clientId: z.string(),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  createdAt: z.string(),
});
const view = (t: typeof apiTokens.$inferSelect): z.infer<typeof tokenView> => ({
  id: t.id,
  kind: t.kind,
  name: t.name,
  prefix: t.prefix,
  scopes: t.scopes,
  memberId: t.memberId,
  clientId: t.clientId,
  lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
  expiresAt: t.expiresAt?.toISOString() ?? null,
  revokedAt: t.revokedAt?.toISOString() ?? null,
  createdAt: t.createdAt.toISOString(),
});

async function mint(
  db: Parameters<typeof subjectMember>[0],
  v: { orgId: string; kind: 'api_key' | 'pat' | 'access'; name: string; scopes: string[]; memberId: string | null; clientId?: string; createdBy: string | null; expiresAt: Date | null },
) {
  const { token, hash } = newToken(TOKEN_PREFIX[v.kind]);
  const [row] = await db
    .insert(apiTokens)
    .values({
      orgId: v.orgId,
      kind: v.kind,
      name: v.name,
      tokenHash: hash,
      prefix: token.slice(0, 10),
      scopes: v.scopes,
      memberId: v.memberId,
      clientId: v.clientId ?? `${v.kind}_${hash.slice(0, 12)}`,
      createdByMemberId: v.createdBy,
      expiresAt: v.expiresAt,
    })
    .returning();
  return { token, row: row! };
}
export { mint as mintAgentToken };

// ── Member: personal access tokens ───────────────────────────────────────────

export const managePersonalTokens = defineCapability({
  name: 'managePersonalTokens',
  description:
    'Create, list or revoke your personal access tokens, which let an AI agent act for you with at most ' +
    'your own permissions. A new token is shown once. Web app only.',
  input: z.discriminatedUnion('op', [
    z.object({ op: z.literal('list') }),
    z.object({ op: z.literal('create'), name: z.string().min(1).max(80), scopes: scopeList, expiresInDays: z.number().int().min(1).max(365).default(90) }),
    z.object({ op: z.literal('revoke'), tokenId: z.uuid() }),
  ]),
  output: z.object({ tokens: z.array(tokenView), created: z.object({ token: z.string(), id: z.uuid() }).nullable() }),
  scope: 'leave:read',
  effect: 'commit',
  idempotent: false,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  rateLimit: 'write',
  surfaces: ['ui'],
  audit: (i) => `Personal access tokens: ${i.op}${i.op === 'create' ? ` "${i.name}" (${i.scopes.join(' ')})` : ''}`,
  async handler({ db, actor, now }, input) {
    if (actor.type !== 'human') throw new CapabilityError('forbidden', 'Only a signed-in person can manage their tokens.');
    const me = await subjectMember(db, actor);
    let created: { token: string; id: string } | null = null;
    if (input.op === 'create') {
      const allowed = ROLE_SCOPES[me.role];
      const bad = input.scopes.filter((s) => !allowed.includes(s));
      if (bad.length) throw new CapabilityError('forbidden', `Your role cannot grant: ${bad.join(', ')}.`);
      const { token, row } = await mint(db, {
        orgId: actor.orgId, kind: 'pat', name: input.name, scopes: input.scopes, memberId: me.id, createdBy: me.id,
        expiresAt: new Date(now.getTime() + input.expiresInDays * 86_400_000),
      });
      created = { token, id: row.id };
    } else if (input.op === 'revoke') {
      const res = await db
        .update(apiTokens)
        .set({ revokedAt: now })
        .where(and(eq(apiTokens.orgId, actor.orgId), eq(apiTokens.id, input.tokenId), eq(apiTokens.memberId, me.id), isNull(apiTokens.revokedAt)))
        .returning();
      if (!res.length) throw new CapabilityError('not_found', 'Token not found.');
    }
    const rows = await db.select().from(apiTokens).where(and(eq(apiTokens.orgId, actor.orgId), eq(apiTokens.memberId, me.id), eq(apiTokens.kind, 'pat'))).orderBy(desc(apiTokens.createdAt));
    return { tokens: rows.map(view), created };
  },
});

// ── Admin: API keys, OAuth clients, kill switch, agent autonomy ─────────────

export const manageAgentAccess = defineCapability({
  name: 'manageAgentAccess',
  description:
    'Admin only. Org-level agent access: list every token and OAuth client, create an API key or a ' +
    'client-credentials app for a service agent (secret shown once), revoke any token or client, and the ' +
    'kill switch that stops all agent access at once (people are unaffected).',
  input: z.discriminatedUnion('op', [
    z.object({ op: z.literal('list') }),
    z.object({ op: z.literal('createApiKey'), name: z.string().min(1).max(80), scopes: scopeList }),
    z.object({ op: z.literal('createOAuthClient'), name: z.string().min(1).max(80), scopes: scopeList }),
    z.object({ op: z.literal('revokeToken'), tokenId: z.uuid() }),
    z.object({ op: z.literal('revokeOAuthClient'), clientRowId: z.uuid() }),
    z.object({ op: z.literal('setAgentAccess'), enabled: z.boolean() }),
  ]),
  output: z.object({
    agentAccessEnabled: z.boolean(),
    tokens: z.array(tokenView.extend({ memberName: z.object({ untrusted_text: z.string() }).nullable() })),
    clients: z.array(z.object({ id: z.uuid(), name: z.string(), clientId: z.string(), scopes: z.array(z.string()), lastUsedAt: z.string().nullable(), revokedAt: z.string().nullable() })),
    created: z.object({ token: z.string().nullable(), clientId: z.string().nullable(), clientSecret: z.string().nullable() }).nullable(),
  }),
  scope: 'admin',
  roles: ['owner', 'admin'],
  effect: 'commit',
  idempotent: false,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  rateLimit: 'write',
  surfaces: ['ui'],
  audit: (i) => `Agent access: ${i.op}${'name' in i ? ` "${i.name}"` : ''}${i.op === 'setAgentAccess' ? (i.enabled ? ' on' : ' OFF (kill switch)') : ''}`,
  async handler({ db, actor, now }, input) {
    if (actor.type !== 'human') throw new CapabilityError('forbidden', 'Only a signed-in admin can manage agent access.');
    const orgId = actor.orgId;
    let created: { token: string | null; clientId: string | null; clientSecret: string | null } | null = null;
    const serviceScopes = (s: Scope[]) => {
      const bad = s.filter((x) => x === 'admin' || x === 'leave:approve');
      if (bad.length) throw new CapabilityError('invalid_input', `Service agents cannot have: ${bad.join(', ')}. Use a personal token for that.`);
      return s;
    };
    switch (input.op) {
      case 'createApiKey': {
        const { token } = await mint(db, { orgId, kind: 'api_key', name: input.name, scopes: serviceScopes(input.scopes), memberId: null, createdBy: actingMemberId(actor), expiresAt: null });
        created = { token, clientId: null, clientSecret: null };
        break;
      }
      case 'createOAuthClient': {
        const secret = newToken('docs');
        const clientId = newToken('doc').token.slice(0, 28);
        await db.insert(oauthClients).values({ orgId, name: input.name, clientId, secretHash: secret.hash, scopes: serviceScopes(input.scopes), createdByMemberId: actingMemberId(actor) });
        created = { token: null, clientId, clientSecret: secret.token };
        break;
      }
      case 'revokeToken': {
        const res = await db.update(apiTokens).set({ revokedAt: now }).where(and(eq(apiTokens.orgId, orgId), eq(apiTokens.id, input.tokenId), isNull(apiTokens.revokedAt))).returning();
        if (!res.length) throw new CapabilityError('not_found', 'Token not found.');
        break;
      }
      case 'revokeOAuthClient': {
        const res = await db.update(oauthClients).set({ revokedAt: now }).where(and(eq(oauthClients.orgId, orgId), eq(oauthClients.id, input.clientRowId), isNull(oauthClients.revokedAt))).returning();
        if (!res.length) throw new CapabilityError('not_found', 'Client not found.');
        // Its access tokens die with it.
        await db.update(apiTokens).set({ revokedAt: now }).where(and(eq(apiTokens.orgId, orgId), eq(apiTokens.clientId, res[0]!.clientId), isNull(apiTokens.revokedAt)));
        break;
      }
      case 'setAgentAccess':
        await db.update(organizations).set({ agentAccessEnabled: input.enabled }).where(eq(organizations.id, orgId));
        break;
      case 'list':
        break;
    }
    const [org] = await db.select({ on: organizations.agentAccessEnabled }).from(organizations).where(eq(organizations.id, orgId));
    const tokens = await db
      .select({ t: apiTokens, name: members.name })
      .from(apiTokens)
      .leftJoin(members, eq(members.id, apiTokens.memberId))
      .where(and(eq(apiTokens.orgId, orgId), gte(apiTokens.createdAt, new Date(now.getTime() - 400 * 86_400_000))))
      .orderBy(desc(apiTokens.createdAt))
      .limit(200);
    const clients = await db.select().from(oauthClients).where(eq(oauthClients.orgId, orgId)).orderBy(asc(oauthClients.createdAt));
    return {
      agentAccessEnabled: org!.on,
      tokens: tokens.filter((r) => r.t.kind !== 'access' || !r.t.revokedAt).map((r) => ({ ...view(r.t), memberName: r.name == null ? null : { untrusted_text: r.name } })),
      clients: clients.map((c) => ({ id: c.id, name: c.name, clientId: c.clientId, scopes: c.scopes, lastUsedAt: c.lastUsedAt?.toISOString() ?? null, revokedAt: c.revokedAt?.toISOString() ?? null })),
      created,
    };
  },
});

// ── Member: drafts agents created for me (R2 confirmation in the web app) ───

const draftView = z.object({
  id: z.uuid(),
  capability: z.string(),
  summary: z.string(),
  createdByActorType: z.string(),
  createdByClientId: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
});

export const listAgentDrafts = defineCapability({
  name: 'listAgentDrafts',
  description: 'Lists actions agents have drafted that are waiting for your confirmation. Reads only.',
  input: z.object({}),
  output: z.object({ drafts: z.array(draftView) }),
  scope: 'leave:read',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui'],
  audit: null,
  async handler({ db, actor, now }) {
    const me = await subjectMember(db, actor);
    const rows = await db
      .select()
      .from(drafts)
      .where(and(eq(drafts.orgId, actor.orgId), eq(drafts.addressedToMemberId, me.id), eq(drafts.status, 'open'), gte(drafts.expiresAt, now)))
      .orderBy(asc(drafts.createdAt));
    return {
      drafts: rows
        .filter((d) => d.capability !== 'acceptPlanProposal')
        .map((d) => ({ id: d.id, capability: d.capability, summary: d.summary, createdByActorType: d.createdByActorType, createdByClientId: d.createdByClientId, createdAt: d.createdAt.toISOString(), expiresAt: d.expiresAt.toISOString() })),
    };
  },
});

export const decideAgentDraft = defineCapability({
  name: 'decideAgentDraft',
  description:
    'Confirm or reject an action an agent drafted for you. Confirming runs it as you, with your ' +
    'permissions and every normal check. Web app only.',
  input: z.object({ draftId: z.uuid(), decision: z.enum(['confirm', 'reject']) }),
  output: z.object({ status: z.enum(['confirmed', 'rejected']), result: z.unknown().nullable() }),
  scope: 'leave:read',
  effect: 'commit',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  rateLimit: 'write',
  surfaces: ['ui'],
  audit: (i) => `${i.decision === 'confirm' ? 'Confirmed' : 'Rejected'} an agent's draft`,
  async handler(ctx, input) {
    const { db, actor, now } = ctx;
    if (actor.type !== 'human') throw new CapabilityError('forbidden', 'Drafts are confirmed by a person.');
    const me = await subjectMember(db, actor);
    const [d] = await db.select().from(drafts).where(and(eq(drafts.orgId, actor.orgId), eq(drafts.id, input.draftId), eq(drafts.addressedToMemberId, me.id)));
    if (!d || d.capability === 'acceptPlanProposal') throw new CapabilityError('not_found', 'Draft not found.');
    if (d.status !== 'open') throw new CapabilityError('conflict', `This draft is already ${d.status}.`);
    if (input.decision === 'reject') {
      await db.update(drafts).set({ status: 'rejected' }).where(eq(drafts.id, d.id));
      return { status: 'rejected' as const, result: null };
    }
    if (d.expiresAt <= now) throw new CapabilityError('conflict', 'This draft has expired.');
    // Typed loosely on purpose: the registry imports this module (a static import would be circular).
    const { invokeCapability } = (await import('../registry')) as unknown as {
      invokeCapability: (name: string, c: CapabilityContext, input: unknown) => Promise<unknown>;
    };
    const result = await invokeCapability(d.capability, ctx, d.payload);
    await db.update(drafts).set({ status: 'confirmed' }).where(eq(drafts.id, d.id));
    return { status: 'confirmed' as const, result };
  },
});
