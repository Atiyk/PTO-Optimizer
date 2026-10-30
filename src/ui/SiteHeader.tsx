import { Container } from './Container';

export type SiteRoute = 'landing' | 'pto' | 'sabbatical' | 'policy' | 'glossary';

interface SiteHeaderProps {
  active: SiteRoute;
}

/**
 * Site restructure: the one piece of chrome shared by every route - a single flat row, no
 * icons, no dropdown, no descriptions, no tagline (the tagline belongs to the landing
 * page's own h1, once, not repeated here). Current page marked by weight and an underline,
 * not a filled pill - a pill reads as a button, and this is navigation. flex-wrap is the
 * full extent of "collapses below 768px".
 *
 * Feature 1, Stage 5C (PR-C): now two small labelled groups instead of one flat list - the
 * two kinds of tool this site has grown into. Still no icons, no dropdown, same underline
 * treatment for the active page; the group label is the only new chrome, kept to a single
 * small uppercase word so it reads as a section heading, not a second layer of navigation.
 */
export function SiteHeader({ active }: SiteHeaderProps) {
  const linkClass = (route: SiteRoute) =>
    active === route
      ? 'font-semibold text-slate-900 underline decoration-2 underline-offset-4'
      : 'text-slate-600 hover:text-slate-900';

  return (
    <div className="border-b border-slate-200 bg-white">
      <Container className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
        <a href="/" className={`text-sm font-semibold ${active === 'landing' ? 'text-slate-900' : 'text-slate-700 hover:text-slate-900'}`}>
          Days Off
        </a>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" aria-label="Plan">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Plan</span>
            <a href="/pto" className={linkClass('pto')} aria-current={active === 'pto' ? 'page' : undefined}>
              PTO Optimizer
            </a>
            <a href="/sabbatical" className={linkClass('sabbatical')} aria-current={active === 'sabbatical' ? 'page' : undefined}>
              Sabbatical Planning
            </a>
          </nav>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm" aria-label="Understand">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Understand</span>
            <a href="/policy" className={linkClass('policy')} aria-current={active === 'policy' ? 'page' : undefined}>
              Your Policy
            </a>
            <a href="/glossary" className={linkClass('glossary')} aria-current={active === 'glossary' ? 'page' : undefined}>
              Glossary
            </a>
          </nav>
        </div>
      </Container>
    </div>
  );
}
