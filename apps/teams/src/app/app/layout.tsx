import Link from 'next/link';
import type { ReactNode } from 'react';
import { and, eq } from 'drizzle-orm';
import { AppNav, type NavGroup } from '@/components/AppNav';
import { getOrg } from '@/domain/leave';
import { getDb } from '@/db/client';
import { members } from '@/db/schema';
import { PRODUCT_NAME } from '@/lib/brand';
import { requireActor } from '@/server/page';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor();
  const db = await getDb();
  const org = await getOrg(db, actor.orgId);
  const [me] = await db.select({ name: members.name }).from(members).where(and(eq(members.orgId, actor.orgId), eq(members.id, actor.memberId!)));
  const manager = actor.role !== 'employee';
  const regulated = org.vertical !== 'general';
  const groups: NavGroup[] = [
    { title: 'You', links: [['/app', 'My leave'], ...(regulated ? ([['/app/sick', 'Sick leave']] as [string, string][]) : []), ['/app/calendar', 'Calendar'], ['/app/events', 'Events']] },
  ];
  if (org.timeClockEnabled && !manager) groups[0]!.links.push(['/app/time', 'My hours']);
  if (manager || regulated) {
    const team: [string, string][] = [];
    if (manager) team.push(['/app/compliance', 'Compliance inbox']);
    if (regulated) team.push(['/app/coverage', 'Coverage']);
    if (manager && org.timeClockEnabled) team.push(['/app/time', 'Timesheets']);
    if (manager) team.push(['/app/approvals', 'Approvals'], ['/app/reports', 'Reports'], ['/app/payout', 'PTO payout'], ['/app/planner', 'Planner']);
    groups.push({ title: 'Team', links: team });
  }
  const settings: [string, string][] = [['/app/agents', 'My agents']];
  if (actor.role === 'owner' || actor.role === 'admin') settings.push(['/app/admin', 'Admin']);
  groups.push({ title: 'Settings', links: settings });
  return (
    <div className="min-h-screen bg-surface">
      <AppNav product={PRODUCT_NAME} org={org.name} person={me?.name ?? 'you'} groups={groups} demo={org.isDemo} />
      <div className="lg:pl-60">
        {org.isDemo && (
          <p className="border-b border-line bg-band px-4 py-2 text-sm text-ink sm:px-8">
            <span className="font-semibold">Demo copy.</span> Everyone here is made up, nothing reaches a real person, and this copy is deleted after a day.{' '}
            <Link href="/signin" className="font-medium underline underline-offset-2">Use your own workspace</Link>
          </p>
        )}
        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
