interface FooterProps {
  onShowShortcuts: () => void;
}

/** One line, per spec: what this is, who made it, a privacy link, plus a keyboard-shortcuts
 * hint (Phase 3 item 8) - the one unobtrusive place to discover "?" opens the shortcut
 * list, for a visitor who'd never otherwise think to try it. No source link - the
 * repository has no public remote configured yet, so linking one would point nowhere. */
export function Footer({ onShowShortcuts }: FooterProps) {
  return (
    <footer className="mt-10 border-t border-slate-100 dark:border-slate-800 px-4 py-4 text-center text-xs text-slate-400 dark:text-slate-400">
      PTO Optimizer &mdash; a free, client-side tool for planning time off. Made by Atiyk Ahmeed.{' '}
      <a href="/privacy.html" className="underline hover:text-slate-600 dark:hover:text-slate-300">
        Privacy
      </a>
      {' · '}
      <button type="button" onClick={onShowShortcuts} className="underline hover:text-slate-600 dark:hover:text-slate-300">
        Keyboard shortcuts (?)
      </button>
    </footer>
  );
}
