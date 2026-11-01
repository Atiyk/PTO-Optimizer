import { useEffect, useId, useRef, useState } from 'react';
import { Container } from './Container';
import { Logo } from './Logo';
import { buttonClasses } from './Button';
import { PRODUCT_NAME } from '../brand';

export type SiteRoute = 'landing' | 'pto' | 'sabbatical' | 'policy' | 'glossary' | 'other';

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
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Plan',
    items: [
      { route: 'pto', href: '/pto', label: 'Plan PTO' },
      { route: 'sabbatical', href: '/sabbatical', label: 'Sabbatical' },
    ],
  },
  {
    label: 'Understand',
    items: [
      { route: 'policy', href: '/policy', label: 'Your policy' },
      { route: 'glossary', href: '/glossary', label: 'Glossary' },
    ],
  },
];

/** The header's one primary action: a link into the tool, never a submit. */
export const HEADER_CTA = { href: '/pto', label: 'Plan my time off' };

/**
 * Redesign Phase 1: logo + wordmark, two labelled nav groups, one primary link, and a
 * reserved slot for "Sign in" (empty until accounts exist, so adding it later can't shift
 * anything).
 *
 * From 1024px the groups sit inline (their visible labels from 1280px; the <nav>s keep their
 * aria-labels and a divider separates them at every width). Below that (the full wordmark, four
 * links and the button don't fit at 768px without wrapping) they collapse into a
 * disclosure: one button with aria-expanded/aria-controls opening a panel - not a step,
 * nothing is hidden that the footer doesn't also link to. Prerendered closed. The primary
 * link stays in the bar from 640px and moves into the panel below that.
 */
export function SiteHeader({ active }: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const linkClass = (route: SiteRoute) =>
    `relative whitespace-nowrap rounded-md px-1 py-1 text-[15px] transition-colors duration-150 ${
      active === route
        ? 'font-semibold text-ink after:absolute after:inset-x-1 after:-bottom-[13px] after:h-[3px] after:rounded-full after:bg-accent'
        : 'text-muted hover:text-ink'
    }`;

  return (
    <header className="border-b border-line bg-page">
      <Container className="flex h-16 items-center gap-4 px-4">
        <a href="/" aria-label={`${PRODUCT_NAME}, home`} className="-ml-1 rounded-md px-1 py-1" aria-current={active === 'landing' ? 'page' : undefined}>
          <Logo />
        </a>

        <div className="ml-auto hidden items-center gap-6 lg:flex xl:gap-7">
          {NAV_GROUPS.map((group, i) => (
            <nav key={group.label} aria-label={group.label} className={`flex items-center gap-4 ${i > 0 ? 'border-l border-line pl-6 xl:pl-7' : ''}`}>
              <span className="hidden text-xs font-semibold uppercase tracking-[0.08em] text-muted xl:inline" aria-hidden="true">
                {group.label}
              </span>
              {group.items.map((item) => (
                <a key={item.route} href={item.href} className={linkClass(item.route)} aria-current={active === item.route ? 'page' : undefined}>
                  {item.label}
                </a>
              ))}
            </nav>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          {/* Reserved for "Sign in" (accounts phase). Fixed width, empty and hidden from
              assistive tech until then, so adding the button can't move anything: it sits
              left of the primary link, which stays flush with the content's right edge. */}
          <div className="hidden h-9 w-[76px] shrink-0 sm:block" data-slot="sign-in" aria-hidden="true" />
          <span className="hidden sm:inline-flex">
            <a href={HEADER_CTA.href} className={buttonClasses('primary', 'sm')}>
              {HEADER_CTA.label}
            </a>
          </span>
          <button
            ref={buttonRef}
            type="button"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-line-strong/40 bg-surface px-3.5 text-sm font-semibold text-ink hover:bg-surface-alt lg:hidden"
            aria-expanded={open}
            aria-controls={panelId}
            onClick={() => setOpen((o) => !o)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              {open ? (
                <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
            Menu
          </button>
        </div>
      </Container>

      <div id={panelId} hidden={!open} className="border-t border-line bg-page lg:hidden">
        <Container className="flex flex-col gap-5 px-4 py-5">
          {NAV_GROUPS.map((group) => (
            <nav key={group.label} aria-label={group.label}>
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-muted" aria-hidden="true">
                {group.label}
              </p>
              <ul className="flex flex-col">
                {group.items.map((item) => (
                  <li key={item.route}>
                    <a
                      href={item.href}
                      aria-current={active === item.route ? 'page' : undefined}
                      className={`flex min-h-11 items-center justify-between rounded-lg text-base ${active === item.route ? 'font-semibold text-ink' : 'text-ink'}`}
                    >
                      {item.label}
                      {active === item.route && <span className="h-2 w-2 rounded-full bg-accent" aria-hidden="true" />}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
          <a href={HEADER_CTA.href} className={buttonClasses('primary', 'md', 'w-full sm:hidden')}>
            {HEADER_CTA.label}
          </a>
        </Container>
      </div>
    </header>
  );
}
