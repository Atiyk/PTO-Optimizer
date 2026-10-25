import { useEffect, useState } from 'react';

/** True for anything that accepts character input - typing a holiday name, a number, a
 * date - where a bare letter key is text, not a shortcut. A range/checkbox/radio/button
 * input doesn't accept typed characters, so a letter key while one of those has focus is a
 * genuine shortcut press, not an in-progress keystroke. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['range', 'checkbox', 'radio', 'button'].includes(type);
  }
  // `isContentEditable` is the right check, but jsdom's implementation of it is incomplete
  // (it doesn't always reflect the contentEditable attribute in a test environment), so the
  // attribute itself is checked too - belt and suspenders, same real-world behavior either way.
  return !!target.isContentEditable || target.getAttribute('contenteditable') === 'true';
}

export interface KeyboardShortcutHandlers {
  onCopyLink: () => void;
  onDownloadIcs: () => void;
}

/**
 * Phase 3 item 8: global keyboard shortcuts - C (copy share link), D (download .ics), ?
 * (show this list). Left/Right on a focused slider needs nothing here: a native
 * <input type="range"> already steps on arrow keys, confirmed live rather than assumed (see
 * NOTES.md). Ignored whenever an editable field has focus (see isEditableTarget) and
 * whenever a modifier key is held, so a browser/OS shortcut (e.g. Cmd+D for bookmarks) is
 * never hijacked.
 */
export function useKeyboardShortcuts({ onCopyLink, onDownloadIcs }: KeyboardShortcutHandlers) {
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;

      if (e.key === 'c' || e.key === 'C') {
        onCopyLink();
      } else if (e.key === 'd' || e.key === 'D') {
        onDownloadIcs();
      } else if (e.key === '?') {
        setShowHelp((v) => !v);
      } else if (e.key === 'Escape') {
        setShowHelp(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCopyLink, onDownloadIcs]);

  return { showHelp, setShowHelp };
}

export { isEditableTarget };
