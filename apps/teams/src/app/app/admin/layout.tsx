import Link from 'next/link';
import type { ReactNode } from 'react';
import { requireActor } from '@/server/page';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const actor = await requireActor();
  if (actor.role !== 'owner' && actor.role !== 'admin') return <p className="text-sm text-muted">Admin pages are for owners and admins.</p>;
  const tabs: [string, string][] = [
    ['/app/admin', 'People'],
    ['/app/admin/setup', 'Setup'],
    ['/app/admin/policies', 'Approvals & policies'],
    ['/app/admin/work-rules', 'Work rules'],
    ['/app/admin/coverage', 'Coverage setup'],
    ['/app/admin/credentials', 'Credentials'],
    ['/app/admin/import', 'Import'],
    ['/app/admin/handbook', 'Handbook'],
    ['/app/admin/data', 'Balances, export & audit'],
    ['/app/admin/ai', 'AI usage'],
    ['/app/admin/agents', 'Agents & API'],
  ];
  return (
    <div className="space-y-4">
      <nav aria-label="Admin" className="flex flex-wrap gap-1 text-sm">
        {tabs.map(([href, text]) => (
          <Link key={href} href={href} className="rounded border border-line bg-page px-2 py-1 text-ink hover:bg-surface-alt">{text}</Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
