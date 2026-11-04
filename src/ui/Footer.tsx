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

const LINK_CLASS = 'inline-flex min-h-11 items-center px-1 -mx-1 text-[#ececE6] transition-colors duration-150 hover:text-white hover:underline hover:decoration-2 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

/** Direct support email; no account or contact-form backend required. */
export const CONTACT_EMAIL = 'atiykahmeed6310@gmail.com';

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-[#b5b5ad]">{title}</h2>
      <ul className="flex flex-col text-[15px]">{children}</ul>
    </div>
  );
}

/**
 * 2026-11 redesign: the footer is the page's one drenched field - an ink close with the name
 * returning at full width (no marker: the marker only ever means your time or your result), then three columns of plain links (the same
 * four tools as the header, one shared list). No external product links.
 */
export function Footer({ onShowShortcuts }: FooterProps) {
  const tools = [{ href: '/pto', label: 'Plan PTO' }, ...NAV_GROUPS.flatMap((g) => g.items)];
  return (
    <footer className="mt-24 bg-[#141414] text-white">
      <Container className="px-4 pt-14 sm:px-6 lg:pt-20">
        <p aria-hidden="true" className="type-display select-none pb-[0.12em] text-[clamp(4.5rem,19vw,17rem)] leading-[0.8] tracking-[-0.03em] text-white">
          Gapless
        </p>
      </Container>
      <Container className="grid grid-cols-2 gap-x-8 gap-y-10 px-4 pt-12 pb-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="col-span-2 md:col-span-1 md:pr-8">
          <p className="flex items-center gap-2.5 font-semibold text-white">
            <LogoMark size={24} />
            {PRODUCT_NAME}
          </p>
          <p className="mt-3 max-w-xs text-[15px] leading-6 text-[#ececE6]">{TAGLINE}</p>
          <p className="mt-2 text-sm text-[#b5b5ad]">Free, and every plan works without an account.</p>
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
          <li>
            <a href="/terms.html" className={LINK_CLASS}>
              Terms of use
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
      <Container className="px-4 sm:px-6">
        <p className="border-t border-white/15 py-5 text-sm text-[#b5b5ad]">
          {PRODUCT_NAME}. Made for more confident time-off planning.
        </p>
      </Container>
    </footer>
  );
}
