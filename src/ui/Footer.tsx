import type { ReactNode } from 'react';
import { Container } from './Container';
import { LogoMark } from './Logo';
import { NAV_GROUPS } from './SiteHeader';
import { PRODUCT_NAME, TAGLINE } from '../brand';

interface FooterProps {
  /** Only the /pto route has a keyboard-shortcuts modal to open - omitted on the landing
   * page and /sabbatical, which don't render that link/button at all rather than pointing
   * it at nothing. */
  onShowShortcuts?: () => void;
}

const LINK_CLASS = 'inline-flex min-h-11 items-center rounded-md text-ink/80 hover:text-accent-ink hover:underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** Direct support email; no account or contact-form backend required. */
export const CONTACT_EMAIL = 'atiykahmeed6310@gmail.com';

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted">{title}</h2>
      <ul className="flex flex-col gap-1.5 text-[15px]">{children}</ul>
    </div>
  );
}

/**
 * Redesign Phase 1: brand + three columns (Product / Resources / About). Product lists the
 * same four tools as the header (D2 labels, one shared list). No external product links.
 */
export function Footer({ onShowShortcuts }: FooterProps) {
  const tools = [{ href: '/pto', label: 'Plan PTO' }, ...NAV_GROUPS.flatMap((g) => g.items)];
  return (
    <footer className="mt-16 border-t border-line bg-surface-alt">
      <Container className="grid grid-cols-2 gap-x-8 gap-y-10 px-4 pt-12 pb-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="col-span-2 md:col-span-1 md:pr-8">
          <p className="flex items-center gap-2.5 font-semibold text-ink">
            <LogoMark size={24} />
            {PRODUCT_NAME}
          </p>
          <p className="mt-3 max-w-xs text-[15px] leading-6 text-muted">{TAGLINE}</p>
          <p className="mt-2 text-sm text-muted">Free, and every plan works without an account.</p>
        </div>
        <Column title="Explore">
          {tools.map((t) => (
            <li key={t.href}>
              <a href={t.href} className={LINK_CLASS}>
                {t.label}
              </a>
            </li>
          ))}
        </Column>
        <Column title="Resources">
          <li>
            <a href="/faq" className={LINK_CLASS}>
              FAQ
            </a>
          </li>
          <li>
            <a href="/docs" className={LINK_CLASS}>
              URL docs
            </a>
          </li>
          <li>
            <a href="/data-sources" className={LINK_CLASS}>
              Data sources
            </a>
          </li>
          <li>
            <a href="/privacy.html" className={LINK_CLASS}>
              Privacy
            </a>
          </li>
        </Column>
        <Column title="Help & privacy">
          <li>
              <a href={`mailto:${CONTACT_EMAIL}?subject=Gapless%20feedback`} className={LINK_CLASS}>
                Contact &amp; feedback
              </a>
          </li>
          <li>
            <a href="https://github.com/Atiyk/PTO-Optimizer/issues" className={LINK_CLASS} target="_blank" rel="noreferrer">
              Report a bug
            </a>
          </li>
          {onShowShortcuts && (
            <li>
              <button type="button" onClick={onShowShortcuts} className={LINK_CLASS}>
                Keyboard shortcuts (?)
              </button>
            </li>
          )}
        </Column>
      </Container>
      <Container className="px-4">
        <p className="border-t border-line py-5 text-sm text-muted">
          {PRODUCT_NAME}. Made for more confident time-off planning.
        </p>
      </Container>
    </footer>
  );
}
