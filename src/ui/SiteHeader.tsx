import { Container } from './Container';
import { Logo } from './Logo';
import { buttonClasses } from './Button';

export type SiteRoute = 'landing' | 'pto' | 'sabbatical' | 'family' | 'policy' | 'glossary' | 'other';

interface SiteHeaderProps {
  active: SiteRoute;
}

interface NavItem {
  route: SiteRoute;
  href: string;
  label: string;
}

/** D2 nav labels (the product name now contains "PTO Optimizer", so the tools are named by
 * what you do there). Routes are unchanged. */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [{
  label: 'Browse',
  items: [
    { route: 'sabbatical', href: '/sabbatical', label: 'Sabbatical' },
    { route: 'family', href: '/family', label: 'Family' },
    { route: 'policy', href: '/policy', label: 'My PTO' },
    { route: 'glossary', href: '/glossary', label: 'Learn' },
  ],
}];

/** The header's one primary action: a link into the tool, never a submit. */
export const HEADER_CTA = { href: '/pto', label: 'Plan PTO' };

/** Every destination, in the order the phone tab bar shows them: the tool first. Five
 * tabs is the most a 320px phone carries at 64px per tab with one-word labels; a sixth
 * destination would need to replace one rather than squeeze in. */
export const TAB_ITEMS: (NavItem & { icon: 'plan' | 'sabbatical' | 'family' | 'policy' | 'learn' })[] = [
  { route: 'pto', href: HEADER_CTA.href, label: HEADER_CTA.label, icon: 'plan' },
  { route: 'sabbatical', href: '/sabbatical', label: 'Sabbatical', icon: 'sabbatical' },
  { route: 'family', href: '/family', label: 'Family', icon: 'family' },
  { route: 'policy', href: '/policy', label: 'My PTO', icon: 'policy' },
  { route: 'glossary', href: '/glossary', label: 'Learn', icon: 'learn' },
];

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';

/** 20px outline icons, one stroke weight, drawn for this product (no icon font). */
function TabIcon({ name, active }: { name: (typeof TAB_ITEMS)[number]['icon']; active: boolean }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" focusable="false">
      {active && <rect x="1" y="8" width="20" height="7" fill="var(--mark)" />}
      {name === 'plan' && (
        <>
          <rect x="3" y="4" width="16" height="15" rx="1.5" {...common} />
          <path d="M3 8.5h16M7.5 2.5v3M14.5 2.5v3" {...common} />
          <path d="M6.5 13h9" {...common} strokeWidth={3} />
        </>
      )}
      {name === 'sabbatical' && (
        <>
          <circle cx="11" cy="8" r="3.25" {...common} />
          <path d="M11 2v1.2M11 12.8V14M5 8h1.2M15.8 8H17M6.8 3.8l.85.85M14.35 11.35l.85.85M15.2 3.8l-.85.85M7.65 11.35l-.85.85" {...common} />
          <path d="M2.5 18.5c2.2-1.6 4.4-1.6 6.6 0s4.4 1.6 6.6 0c.9-.65 1.85-1 2.8-1" {...common} />
        </>
      )}
      {name === 'family' && (
        <>
          <circle cx="7.5" cy="6" r="2.5" {...common} />
          <circle cx="15.5" cy="9" r="2" {...common} />
          <path d="M3 19v-3.5a4.5 4.5 0 0 1 9 0V19M12.5 19v-2.5a3 3 0 0 1 6 0V19" {...common} />
        </>
      )}
      {name === 'policy' && (
        <>
          <path d="M4 18.5V12M9 18.5V6.5M14 18.5V9.5M19 18.5V3.5" {...common} strokeWidth={2.5} />
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
 * 2026-11 redesign. Desktop (lg+): a plain paper bar - wordmark, four links, one primary
 * action. The current page carries a marker stroke under its label. Below lg the bar keeps
 * only the wordmark, and every destination moves into a fixed bottom tab bar (five
 * destinations, 56px tall plus the safe area), the phone's own navigation pattern: one tap to
 * any tool from anywhere, no menu to open first. index.css reserves the space for it so it
 * never covers content. Every link is a real link; nothing is hidden behind a disclosure.
 */
export function SiteHeader({ active }: SiteHeaderProps) {
  const linkClass = (route: SiteRoute) =>
    `relative inline-flex min-h-11 items-center whitespace-nowrap px-1 text-[15px] font-semibold transition-colors duration-150 ${FOCUS} ${
      active === route
        ? 'text-ink after:absolute after:inset-x-0 after:bottom-[9px] after:-z-10 after:h-[9px] after:bg-mark'
        : 'text-muted hover:text-ink'
    }`;

  return (
    <header className="border-b border-line bg-page">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:inline-flex focus:min-h-11 focus:items-center focus:rounded-[3px] focus:border focus:border-ink focus:bg-surface focus:px-4 focus:text-sm focus:font-semibold focus:text-ink">Skip to main content</a>
      <Container className="flex min-h-[60px] items-center gap-4 px-4 sm:px-6 lg:min-h-[68px]">
        <a href="/" className={`-ml-1 inline-flex min-h-11 items-center px-1 ${FOCUS}`} aria-current={active === 'landing' ? 'page' : undefined}>
          <Logo />
          <span className="sr-only"> home</span>
        </a>

        <div className="ml-auto hidden items-center gap-7 lg:flex">
          {NAV_GROUPS.map((group) => (
            <nav key={group.label} aria-label="Explore" className="isolate flex items-center gap-6">
              {group.items.map((item) => (
                <a key={item.route} href={item.href} className={linkClass(item.route)} aria-current={active === item.route ? 'page' : undefined}>
                  {item.label}
                </a>
              ))}
            </nav>
          ))}
          <a href={HEADER_CTA.href} aria-current={active === 'pto' ? 'page' : undefined} className={`${buttonClasses('primary', 'sm')} min-h-11 ${FOCUS}`}>
            {HEADER_CTA.label}
          </a>
        </div>
      </Container>

      <nav
        aria-label="Tools"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/15 bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="mx-auto grid max-w-xl grid-cols-5">
          {TAB_ITEMS.map((item) => {
            const isActive = active === item.route;
            return (
              <li key={item.route} className="min-w-0">
                <a
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[12px] leading-4 ${isActive ? 'font-bold text-ink' : 'font-medium text-muted'} ${FOCUS} focus-visible:-outline-offset-2`}
                >
                  <TabIcon name={item.icon} active={isActive} />
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
