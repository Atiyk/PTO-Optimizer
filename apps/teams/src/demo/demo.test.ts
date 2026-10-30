import { readFileSync } from 'node:fs';
import { count, eq } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Db } from '@/db/client';
import { auditLog, leavePolicies, locations, members, organizations } from '@/db/schema';
import { POST } from '@/app/api/demo/handbook/route';
import { freshDb } from '@/test/db';
import { NOW } from '@/test/fixtures';
import { DEMO_HANDBOOK, demoActors, demoPlan, demoReadHandbook } from './demo';

/* Phase 8: the public demo on the shared sample org. Tests run with AI off (vitest env). */

let db: Db;
beforeAll(async () => {
  db = await freshDb();
});

const post = (body: unknown, origin = 'http://teams.test') =>
  POST(new NextRequest('http://teams.test/api/demo/handbook', { method: 'POST', body: JSON.stringify(body), headers: { origin, 'content-type': 'application/json' } }));

describe('demo org', () => {
  it('bundles the same handbook as samples/demo-handbook.md', () => {
    expect(DEMO_HANDBOOK).toBe(readFileSync('samples/demo-handbook.md', 'utf8'));
  });

  it('is seeded once: 25 people across 2 countries, agents off', async () => {
    const [a, b] = await Promise.all([demoActors(db, NOW), demoActors(db, NOW)]);
    expect(a.orgId).toBe(b.orgId);
    expect(await db.select({ n: count() }).from(organizations).where(eq(organizations.isDemo, true))).toEqual([{ n: 1 }]);
    const [people] = await db.select({ n: count() }).from(members).where(eq(members.orgId, a.orgId));
    expect(people!.n).toBe(25);
    const countries = new Set((await db.select().from(locations).where(eq(locations.orgId, a.orgId))).map((l) => l.countryCode));
    expect([...countries].sort()).toEqual(['GB', 'US']);
    const [org] = await db.select().from(organizations).where(eq(organizations.id, a.orgId));
    expect(org!.agentAccessEnabled).toBe(false);
  });

  it('reads the sample handbook from the stored model result when AI is unavailable, and says so', async () => {
    const r = await demoReadHandbook(db, DEMO_HANDBOOK, NOW);
    expect(r.label).toMatch(/AI is unavailable right now, so this is a stored result/);
    expect(r.fields.annualAllowance).toMatchObject({ status: 'verified', value: 20 });
    expect(r.fields.annualAllowance!.quote?.untrusted_text).toContain('20 days');
    // The injection line ("unlimited vacation") changed nothing.
    expect(r.fields.accrualMethod!.value).not.toBe('unlimited');
    expect(JSON.stringify(r.policy)).not.toContain('unlimited');
    expect(r.questions.length).toBeGreaterThan(0);
  });

  it('falls back to the built-in rules for other text, and says so', async () => {
    const r = await demoReadHandbook(db, 'Employees get 15 days of paid vacation per calendar year.', NOW);
    expect(r.label).toMatch(/built-in rules/);
  });

  it('saves nothing: no policy is added to the demo org', async () => {
    const { orgId } = await demoActors(db, NOW);
    const before = await db.select({ n: count() }).from(leavePolicies).where(eq(leavePolicies.orgId, orgId));
    await post({ text: DEMO_HANDBOOK });
    expect(await db.select({ n: count() }).from(leavePolicies).where(eq(leavePolicies.orgId, orgId))).toEqual(before);
    // Reading is audited like any other action, under the demo's own client id.
    const rows = await db.select().from(auditLog).where(eq(auditLog.orgId, orgId));
    expect(rows.some((r) => r.capability === 'importHandbook')).toBe(true);
  });

  it('plans the Engineering team deterministically and keeps the coverage rule', async () => {
    const plan = await demoPlan(db, NOW);
    expect(plan.team.name).toBe('Engineering');
    expect(plan.totals.atRisk).toBeGreaterThan(0);
    expect(plan.totals.placed).toBeGreaterThan(0);
    for (const d of plan.heatmap) for (const r of d.rules) expect(r.slackLeft).toBeGreaterThanOrEqual(0);
    const other = await freshDb();
    const again = await demoPlan(other, NOW);
    expect(again).toBe(plan); // memoized for the day
  });
});

describe('demo route', () => {
  it('refuses cross-site posts and bad input', async () => {
    expect((await post({ text: DEMO_HANDBOOK }, 'https://evil.example')).status).toBe(403);
    expect((await post({ text: 'short' })).status).toBe(400);
    expect((await post({ text: 'x'.repeat(20_001) })).status).toBe(400);
  });

  it('reads the sample when no text is sent', async () => {
    const res = await post({});
    expect(res.status).toBe(200);
    expect(((await res.json()) as { fields: Record<string, unknown> }).fields).toHaveProperty('annualAllowance');
  });
});
