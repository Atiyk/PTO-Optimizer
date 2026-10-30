import { describe, expect, it } from 'vitest';
import { auditLog } from '@/db/schema';
import { freshDb, seedOrg } from '@/test/db';
import { CapabilityError } from './errors';
import { CAPABILITIES, invokeCapability } from './registry';
import type { Actor } from './types';

describe('capability registry', () => {
  it('every capability declares the R1 metadata', () => {
    for (const [key, cap] of Object.entries(CAPABILITIES)) {
      expect(cap.name).toBe(key);
      expect(cap.description.length).toBeGreaterThan(60);
      expect(['read', 'draft', 'commit']).toContain(cap.effect);
      // Commit actions reachable by agents must be safe to retry.
      if (cap.effect === 'commit' && (cap.surfaces as readonly string[]).includes('mcp')) expect(cap.idempotent).toBe(true);
      expect(cap.annotations.readOnlyHint).toBe(cap.effect === 'read');
    }
  });

  it('keeps the externally exposed (MCP) tool count within 25', () => {
    const mcp = Object.values(CAPABILITIES).filter((c) => (c.surfaces as readonly string[]).includes('mcp'));
    expect(mcp.length).toBeLessThanOrEqual(25);
  });

  it('denies a missing scope and audits the denial with the actor model (R3)', async () => {
    const db = await freshDb();
    const { org, emp } = await seedOrg(db);
    const agent: Actor = {
      type: 'agent-on-behalf-of-user',
      orgId: org.id,
      memberId: null,
      role: null,
      clientId: 'client_test',
      onBehalfOfMemberId: emp.id,
      scopes: ['policy:read'],
    };
    await expect(invokeCapability('getMyBalance', { db, actor: agent, now: new Date('2026-10-30T00:00:00Z') }, {})).rejects.toMatchObject({
      code: 'forbidden',
    } satisfies Partial<CapabilityError>);
    const [row] = await db.select().from(auditLog);
    expect(row).toMatchObject({
      actorType: 'agent-on-behalf-of-user',
      clientId: 'client_test',
      onBehalfOfMemberId: emp.id,
      capability: 'getMyBalance',
      outcome: 'denied',
      scopes: ['policy:read'],
    });
  });

  it('an agent with the scope reads its member’s balance, same number as the human', async () => {
    const db = await freshDb();
    const { org, emp } = await seedOrg(db);
    const now = new Date('2026-10-30T00:00:00Z');
    const agent: Actor = {
      type: 'agent-on-behalf-of-user', orgId: org.id, memberId: null, role: null,
      clientId: 'client_test', onBehalfOfMemberId: emp.id, scopes: ['leave:read'],
    };
    const human: Actor = {
      type: 'human', orgId: org.id, memberId: emp.id, role: 'employee',
      clientId: null, onBehalfOfMemberId: null, scopes: ['leave:read'],
    };
    const a = await invokeCapability('getMyBalance', { db, actor: agent, now }, {});
    const h = await invokeCapability('getMyBalance', { db, actor: human, now }, {});
    expect(a).toEqual(h);
  });

  it('a service agent (no member identity) cannot call a "me" capability', async () => {
    const db = await freshDb();
    const { org } = await seedOrg(db);
    const svc: Actor = {
      type: 'service-agent', orgId: org.id, memberId: null, role: null,
      clientId: 'agentforce', onBehalfOfMemberId: null, scopes: ['leave:read'],
    };
    await expect(invokeCapability('getMyBalance', { db, actor: svc, now: new Date() }, {})).rejects.toMatchObject({ code: 'forbidden' });
  });
});
