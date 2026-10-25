interface KeyboardShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: '← / →', action: 'Adjust the focused slider' },
  { keys: 'C', action: 'Copy share link' },
  { keys: 'D', action: 'Download .ics' },
  { keys: '?', action: 'Show this list' },
];

export function KeyboardShortcutsHelp({ open, onClose }: KeyboardShortcutsHelpProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
    >
      <div className="w-full max-w-sm rounded-lg bg-white dark:bg-slate-800 p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            &times;
          </button>
        </div>
        <dl className="flex flex-col gap-2 text-sm">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between gap-4">
              <dt>
                <kbd className="rounded border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700 px-1.5 py-0.5 text-xs font-mono text-slate-700 dark:text-slate-200">
                  {s.keys}
                </kbd>
              </dt>
              <dd className="text-slate-600 dark:text-slate-300">{s.action}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
