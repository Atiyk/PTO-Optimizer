import { and, asc, eq } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { members, organizations, teams } from '@/db/schema';
import { verifyHandbookProposal } from '@/ai/handbook';
import { importHandbookTask } from '@/ai/tasks/importHandbook';
import { invokeCapability, type CapabilityOutput } from '@/capabilities/registry';
import { ROLE_SCOPES } from '@/capabilities/scopes';
import type { Actor } from '@/capabilities/types';
import { untrusted } from '@/capabilities/helpers';
import { seedDemoOrg } from '@/server/seed';
import fixture from './handbookFixture.json';
import { DEMO_HANDBOOK } from './handbookText';

/*
 * The public demo: one shared sample org (Northwind Labs, 25 people in San Francisco and London),
 * used read-only. Visitors can read a handbook (a draft, never saved) and see the team planner.
 * Nothing a visitor does is stored.
 */

export { DEMO_HANDBOOK };

export const DEMO_COMPANY = 'Northwind Labs';

let pending: Promise<string> | null = null;

async function demoOrgId(db: Db, today: string): Promise<string> {
  const [org] = await db.select({ id: organizations.id }).from(organizations).where(and(eq(organizations.isDemo, true), eq(organizations.name, DEMO_COMPANY))).orderBy(asc(organizations.createdAt)).limit(1);
  if (org) return org.id;
  // One seed per process at a time; a second instance racing us just leaves an unused org.
  pending ??= (async () => {
    const { org: created } = await seedDemoOrg(db, today, { orgName: DEMO_COMPANY });
    await db.update(organizations).set({ isDemo: true, agentAccessEnabled: false }).where(eq(organizations.id, created.id));
    return created.id;
  })().finally(() => {
    pending = null;
  });
  return pending;
}

const actorFor = (m: typeof members.$inferSelect): Actor => ({
  type: 'human', orgId: m.orgId, memberId: m.id, role: m.role, clientId: 'demo', onBehalfOfMemberId: null, scopes: ROLE_SCOPES[m.role],
});

export async function demoActors(db: Db, now: Date) {
  const orgId = await demoOrgId(db, now.toISOString().slice(0, 10));
  const people = await db.select().from(members).where(eq(members.orgId, orgId)).orderBy(asc(members.createdAt));
  const owner = people.find((m) => m.role === 'owner')!;
  const [eng] = await db.select().from(teams).where(and(eq(teams.orgId, orgId), eq(teams.name, 'Engineering')));
  const manager = people.find((m) => m.role === 'manager' && m.teamId === eng?.id) ?? owner;
  return { orgId, owner: actorFor(owner), manager: actorFor(manager), engineeringTeamId: eng?.id };
}

export type DemoHandbook = CapabilityOutput<'importHandbook'> & { label: string };

/**
 * Reads a handbook as the demo admin. The real model when available; when it isn't and the text
 * is the sample, a stored real-model result (and the page says so); otherwise the built-in rules.
 */
export async function demoReadHandbook(db: Db, text: string, now: Date): Promise<DemoHandbook> {
  const { owner } = await demoActors(db, now);
  const out = await invokeCapability('importHandbook', { db, actor: owner, now }, { text });
  if (out.source.used !== 'rules') {
    return { ...out, label: out.source.cached ? 'Read by AI earlier (same text, cached).' : out.source.used === 'demo' ? 'Read by the built-in demo reader.' : 'Read by AI just now.' };
  }
  if (text.trim() === DEMO_HANDBOOK.trim()) {
    const v = verifyHandbookProposal(text, importHandbookTask.output.parse(fixture.proposal));
    return {
      fields: Object.fromEntries(Object.entries(v.fields).map(([k, f]) => [k, { ...f, quote: untrusted(f.quote) }])),
      policy: v.policy,
      citations: v.citations,
      assumptions: v.assumptions,
      questions: v.questions,
      source: { used: 'ai', unavailableReason: out.source.unavailableReason, cached: true },
      label: `AI is unavailable right now, so this is a stored result from ${fixture.model} for this exact handbook (${fixture.at.slice(0, 10)}).`,
    } as DemoHandbook;
  }
  return { ...out, label: 'AI is unavailable right now, so the built-in rules read this. They catch less than the model.' };
}

const plans = new Map<string, Promise<CapabilityOutput<'runTeamPlan'>>>();

/** The Engineering team's plan, as its manager sees it. Same day, same plan, so one run (and one AI summary) per day per instance. */
export function demoPlan(db: Db, now: Date) {
  const day = now.toISOString().slice(0, 10);
  let plan = plans.get(day);
  if (!plan) {
    plans.clear();
    plan = demoActors(db, now).then(({ manager, engineeringTeamId }) => invokeCapability('runTeamPlan', { db, actor: manager, now }, { teamId: engineeringTeamId }));
    plan.catch(() => plans.delete(day));
    plans.set(day, plan);
  }
  return plan;
}
