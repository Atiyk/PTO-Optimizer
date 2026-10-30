import Link from 'next/link';
import type { ReactNode } from 'react';

const TABS: [href: string, label: string][] = [
  ['/m', 'Today'],
  ['/m/offers', 'Offers'],
  ['/m/leave', 'Leave'],
  ['/m/me', 'Me'],
];

/** Header, content and a bottom tab bar sized for thumbs (48px targets). */
export function Shell({ title, org, active, badge, children }: { title: string; org: string; active: string; badge?: number; children: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-page px-4 py-3">
        <div className="text-xs text-muted">{org}</div>
        <h1 className="text-lg font-semibold text-ink">{title}</h1>
      </header>
      <main className="mx-auto max-w-md space-y-4 px-4 pt-4 pb-28">{children}</main>
      <nav aria-label="Staff app" className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-page pb-[env(safe-area-inset-bottom)]">
        <ul className="mx-auto grid max-w-md grid-cols-4">
          {TABS.map(([href, label]) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={active === href ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center text-sm ${active === href ? 'font-semibold text-accent underline underline-offset-4' : 'text-ink'}`}
              >
                {label}
                {label === 'Offers' && badge ? <span className="text-xs font-semibold">({badge} new)</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
