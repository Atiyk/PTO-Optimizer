'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Logo } from '@/components/Logo';

export type NavGroup = { title: string; links: [href: string, text: string][] };

/** The page a link belongs to: /app is exact, the others own their sub-pages. */
const isCurrent = (href: string, path: string) => (href === '/app' ? path === '/app' : path === href || path.startsWith(`${href}/`));

function Links({ groups, path }: { groups: NavGroup[]; path: string }) {
  return (
    <>
      {groups.map((g) => (
        <div key={g.title} className="mt-6 first:mt-0">
          <p className="px-3 text-xs font-semibold tracking-wide text-muted uppercase">{g.title}</p>
          <ul className="mt-2 space-y-0.5">
            {g.links.map(([href, text]) => {
              const current = isCurrent(href, path);
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={current ? 'page' : undefined}
                    className={`block rounded-md px-3 py-2 text-sm ${current ? 'bg-accent-soft font-semibold text-accent' : 'text-ink hover:bg-surface-alt'}`}
                  >
                    {text}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

function SignOut({ demo }: { demo: boolean }) {
  return (
    <form action={demo ? '/api/auth/signout?to=home' : '/api/auth/signout'} method="post">
      <button className="w-full rounded-md px-3 py-2 text-left text-sm text-muted hover:bg-surface-alt hover:text-ink">{demo ? 'Leave the demo' : 'Sign out'}</button>
    </form>
  );
}

/**
 * The app's navigation: a sidebar from 1024px, a top bar with a menu button below that. The
 * menu closes itself after a navigation.
 */
export function AppNav({ product, org, person, groups, demo }: { product: string; org: string; person: string; groups: NavGroup[]; demo: boolean }) {
  const path = usePathname();
  // Open for the page it was opened on only, so a navigation closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const brand = (
    <Link href="/app" className="flex min-w-0 items-center gap-2">
      <Logo />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{org}</span>
        <span className="block truncate text-xs text-muted">{product}</span>
      </span>
    </Link>
  );
  return (
    <>
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-60 lg:flex-col lg:border-r lg:border-line lg:bg-page">
        <div className="border-b border-line px-4 py-4">{brand}</div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-2 py-5">
          <Links groups={groups} path={path} />
        </nav>
        <div className="border-t border-line px-2 py-3">
          <p className="truncate px-3 pb-1 text-xs text-muted">Signed in as {person}</p>
          <SignOut demo={demo} />
        </div>
      </aside>
      <header className="sticky top-0 z-20 border-b border-line bg-page lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          {brand}
          <button
            type="button"
            aria-expanded={open}
            aria-controls="app-menu"
            onClick={() => setOpenOn(open ? null : path)}
            className="inline-flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-surface-alt"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true" focusable="false">
              {open ? <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /> : <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />}
            </svg>
            Menu
          </button>
        </div>
        <div id="app-menu" hidden={!open} className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-line px-2 py-4">
          <nav aria-label="Main">
            <Links groups={groups} path={path} />
          </nav>
          <div className="mt-4 border-t border-line pt-3">
            <p className="truncate px-3 pb-1 text-xs text-muted">Signed in as {person}</p>
            <SignOut demo={demo} />
          </div>
        </div>
      </header>
    </>
  );
}
