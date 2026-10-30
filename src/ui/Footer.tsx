import { Container } from './Container';

interface FooterProps {
  /** Only the /pto route has a keyboard-shortcuts modal to open - omitted on the landing
   * page and /sabbatical, which don't render that link/button at all rather than pointing
   * it at nothing. */
  onShowShortcuts?: () => void;
}

const LINK_CLASS = 'hover:text-slate-700';

/**
 * Phase 6B: spec asks for a mailto as the primary contact method, GitHub issues as
 * secondary. No real address exists yet (see PROGRESS.md's "Questions for Atiyk") -
 * rather than ship a fake mailto:hello@example.com that would silently fail for a real
 * visitor, GitHub issues (already real and working) stays the only contact link until an
 * address is provided; this constant is the one place to add it, which then becomes the
 * primary link with GitHub demoted to secondary, with no other code to change.
 */
const CONTACT_EMAIL: string | null = null; // TODO(Atiyk): set the real address here

/**
 * Site restructure: the footer carries the navigational weight the header deliberately
 * doesn't - three columns, denser than the header, shared across all three routes. Product
 * links work from anywhere (not just a "you are here" indicator - the header already does
 * that); Resources is everything from the machine-readability pass; About is the one line
 * of attribution plus a real, existing link (the repository's GitHub issues - the only
 * contact channel that actually exists, never a fabricated email address).
 */
export function Footer({ onShowShortcuts }: FooterProps) {
  return (
    <footer className="mt-8 border-t border-slate-200 bg-slate-50">
      <Container className="grid grid-cols-2 gap-8 px-4 py-8 text-sm text-slate-500 sm:grid-cols-4">
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Product</h2>
          <ul className="flex flex-col gap-1.5">
            <li>
              <a href="/pto" className={LINK_CLASS}>
                PTO Optimizer
              </a>
            </li>
            <li>
              <a href="/sabbatical" className={LINK_CLASS}>
                Sabbatical Planning
              </a>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Resources</h2>
          <ul className="flex flex-col gap-1.5">
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
          </ul>
        </div>
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">About</h2>
          <ul className="flex flex-col gap-1.5">
            <li>Made by Atiyk Ahmeed.</li>
            {CONTACT_EMAIL && (
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`} className={LINK_CLASS}>
                  Contact
                </a>
              </li>
            )}
            <li>
              <a href="https://github.com/Atiyk/PTO-Optimizer/issues" className={LINK_CLASS} target="_blank" rel="noreferrer">
                {CONTACT_EMAIL ? 'Report an issue' : 'Contact & feedback'}
              </a>
            </li>
            {onShowShortcuts && (
              <li>
                <button type="button" onClick={onShowShortcuts} className={LINK_CLASS}>
                  Keyboard shortcuts (?)
                </button>
              </li>
            )}
          </ul>
        </div>
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Days Off</h2>
          <p className="text-slate-400">A free, client-side way to make every PTO day count. No sign-up, no account.</p>
        </div>
      </Container>
    </footer>
  );
}
