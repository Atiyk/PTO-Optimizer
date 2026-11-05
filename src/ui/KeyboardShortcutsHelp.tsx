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
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
    >
      <div className="w-full max-w-sm rounded-[10px] bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold text-ink type-condensed">Keyboard shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-[6px] text-lg text-muted hover:bg-surface-alt hover:text-ink"
          >
            &times;
          </button>
        </div>
        <dl className="flex flex-col gap-2 text-sm">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between gap-4">
              <dt>
                <kbd className="rounded-[6px] border border-line-strong bg-surface-alt px-2 py-0.5 text-sm font-semibold text-ink">
                  {s.keys}
                </kbd>
              </dt>
              <dd className="text-muted">{s.action}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
