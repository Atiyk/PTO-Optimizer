import Link from 'next/link';
import type { ReactNode } from 'react';
import { getOrg } from '@/domain/leave';
import { getDb } from '@/db/client';
import { PRODUCT_NAME } from '@/lib/brand';
import { requireActor } from '@/server/page';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor();
  const org = await getOrg(await getDb(), actor.orgId);
  const links: [string, string][] = [
    ['/app', 'My leave'],
    ['/app/calendar', 'Calendar'],
  ];
  if (org.vertical !== 'general') links.push(['/app/coverage', 'Coverage'], ['/app/sick', 'Sick leave']);
  if (actor.role !== 'employee') links.push(['/app/approvals', 'Approvals'], ['/app/planner', 'Planner']);
  links.push(['/app/agents', 'My agents']);
  if (actor.role === 'owner' || actor.role === 'admin') links.push(['/app/admin', 'Admin']);
  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-line bg-page">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <div className="text-sm">
            <span className="font-semibold text-ink">{PRODUCT_NAME}</span>
            <span className="text-muted"> · {org.name}</span>
          </div>
          <nav aria-label="Main" className="flex flex-wrap items-center gap-1 text-sm">
            {links.map(([href, text]) => (
              <Link key={href} href={href} className="rounded px-2 py-1 text-ink hover:bg-surface-alt">
                {text}
              </Link>
            ))}
            <form action="/api/auth/signout" method="post">
              <button className="rounded px-2 py-1 text-muted hover:bg-surface-alt">Sign out</button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
