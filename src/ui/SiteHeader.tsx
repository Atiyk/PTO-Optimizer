import { Container } from './Container';
import { Logo } from './Logo';

export type SiteRoute = 'landing' | 'pto' | 'sabbatical' | 'family' | 'policy' | 'glossary' | 'other';

interface SiteHeaderProps {
  active: SiteRoute;
}

interface NavItem {
  route: SiteRoute;
  href: string;
  label: string;
}

/**
 * 2026-11 information architecture. Three destinations, by what the visitor came to do:
 * - Plan: make a plan. Time off (the optimizer), Family (school breaks) and Sabbatical are
 *   three ways of planning, so they share one destination and switch with PLAN_MODES.
 * - My PTO: keep the plan true (balance forecast, expiry, requests, payout).
 * - Learn: the glossary and guides.
 * Routes are unchanged; every old URL still lands where it did.
 */
export const PLAN_MODES: NavItem[] = [
  { route: 'pto', href: '/pto', label: 'Time off' },
  { route: 'family', href: '/family', label: 'Family' },
  { route: 'sabbatical', href: '/sabbatical', label: 'Sabbatical' },
];

const PLAN_ROUTES: SiteRoute[] = PLAN_MODES.map((m) => m.route);

export const PRIMARY_NAV: (NavItem & { icon: 'plan' | 'policy' | 'learn'; matches: SiteRoute[] })[] = [
  { route: 'pto', href: '/pto', label: 'Plan', icon: 'plan', matches: PLAN_ROUTES },
  { route: 'policy', href: '/policy', label: 'My PTO', icon: 'policy', matches: ['policy'] },
  { route: 'glossary', href: '/glossary', label: 'Learn', icon: 'learn', matches: ['glossary'] },
];

/** Kept for the footer: every tool, flat, in the order the planner presents them. */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [{
  label: 'Explore',
  items: [
    { route: 'pto', href: '/pto', label: 'Plan time off' },
    { route: 'family', href: '/family', label: 'Plan around school breaks' },
    { route: 'sabbatical', href: '/sabbatical', label: 'Plan a sabbatical' },
    { route: 'policy', href: '/policy', label: 'My PTO' },
    { route: 'glossary', href: '/glossary', label: 'Learn' },
  ],
}];

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';

/** 22px outline icons, one stroke weight, drawn for this product (no icon font). */
function TabIcon({ name }: { name: (typeof PRIMARY_NAV)[number]['icon'] }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      {name === 'plan' && (
        <>
          <rect x="3" y="4" width="16" height="15" rx="2" {...common} />
          <path d="M3 8.5h16M7.5 2.5v3M14.5 2.5v3" {...common} />
          <path d="M6.5 13.5h9" {...common} strokeWidth={2.75} />
        </>
      )}
      {name === 'policy' && (
        <>
          <path d="M4 18.5V12M9 18.5V6.5M14 18.5V9.5M19 18.5V3.5" {...common} strokeWidth={2.25} />
        </>
      )}
      {name === 'learn' && (
        <>
          <path d="M3 5.5c2.7-1.2 5.3-1.2 8 0v13c-2.7-1.2-5.3-1.2-8 0z" {...common} />
          <path d="M11 5.5c2.7-1.2 5.3-1.2 8 0v13c-2.7-1.2-5.3-1.2-8 0z" {...common} />
        </>
      )}
    </svg>
  );
}

/**
 * Desktop (lg+): logo, then the three destinations; the current one carries an indigo rule on
 * the header's bottom edge. Phones: the logo bar stays, and the three destinations move to a
 * fixed bottom tab bar (56px plus the safe area) within thumb reach; index.css reserves its
 * height. On the planning routes a second row switches between the three ways to plan, at
 * every width. Every item is a real link; nothing is behind a menu.
 */
export function SiteHeader({ active }: SiteHeaderProps) {
  const isCurrent = (item: (typeof PRIMARY_NAV)[number]) => item.matches.includes(active);
  const inPlan = PLAN_ROUTES.includes(active);

  return (
    <header className="border-b border-line bg-surface">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-[6px] focus:border focus:border-ink focus:bg-surface focus:px-4 focus:text-sm focus:font-semibold focus:text-ink">Skip to main content</a>
      <Container className="flex min-h-14 items-center gap-4 px-4 sm:px-6 lg:min-h-16">
        <a href="/" className={`-ml-1 inline-flex min-h-11 items-center rounded-[6px] px-1 ${FOCUS}`} aria-current={active === 'landing' ? 'page' : undefined}>
          <Logo size={28} />
          <span className="sr-only"> home</span>
        </a>

        <nav aria-label="Main" className="ml-auto hidden self-stretch lg:flex">
          <ul className="flex items-stretch gap-1">
            {PRIMARY_NAV.map((item) => {
              const current = isCurrent(item);
              return (
                <li key={item.route} className="flex">
                  <a
                    href={item.href}
                    aria-current={current ? 'page' : undefined}
                    className={`relative inline-flex items-center px-4 text-[15px] font-semibold transition-colors duration-150 ${FOCUS} focus-visible:-outline-offset-2 ${
                      current ? 'text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-[3px] after:rounded-t-full after:bg-accent' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </Container>

      {inPlan && (
        <div className="border-t border-line">
          <Container className="px-4 sm:px-6">
            <nav aria-label="Ways to plan" className="-mx-1 overflow-x-auto">
              <ul className="flex min-w-max gap-1 py-2">
                {PLAN_MODES.map((mode) => {
                  const current = mode.route === active;
                  return (
                    <li key={mode.route}>
                      <a
                        href={mode.href}
                        aria-current={current ? 'page' : undefined}
                        className={`inline-flex min-h-11 items-center rounded-full px-4 text-[15px] font-semibold transition-colors duration-150 ${FOCUS} ${
                          current ? 'bg-ink text-white' : 'text-muted hover:bg-surface-alt hover:text-ink'
                        }`}
                      >
                        {mode.label}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </Container>
        </div>
      )}

      <nav
        aria-label="Tools"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm lg:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-3">
          {PRIMARY_NAV.map((item) => {
            const current = isCurrent(item);
            return (
              <li key={item.route} className="min-w-0">
                <a
                  href={item.href}
                  aria-current={current ? 'page' : undefined}
                  className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[12px] leading-4 transition-colors duration-150 ${current ? 'font-bold text-ink' : 'font-medium text-muted'} ${FOCUS} focus-visible:-outline-offset-2`}
                >
                  {current && <span aria-hidden="true" className="absolute inset-x-[30%] top-0 h-[3px] rounded-b-full bg-accent" />}
                  <span className={current ? 'text-accent' : ''}><TabIcon name={item.icon} /></span>
                  <span className="truncate">{item.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
