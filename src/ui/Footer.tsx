import { Container } from './Container';

interface FooterProps {
  /** Only the /pto route has a keyboard-shortcuts modal to open - omitted on the landing
   * page and /sabbatical, which don't render that link/button at all rather than pointing
   * it at nothing. */
  onShowShortcuts?: () => void;
}

const LINK_CLASS = 'hover:text-slate-700';

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
              <a href="/pto#questions" className={LINK_CLASS}>
                FAQ
              </a>
            </li>
            <li>
              <a href="/docs" className={LINK_CLASS}>
                URL docs
              </a>
            </li>
            <li>
              <a href="/data-sources.json" className={LINK_CLASS}>
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
            <li>
              <a href="https://github.com/Atiyk/PTO-Optimizer/issues" className={LINK_CLASS} target="_blank" rel="noreferrer">
                Contact &amp; feedback
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
