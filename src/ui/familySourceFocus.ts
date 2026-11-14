/**
 * Opens one of the "Add or correct dates" sections (or the US presets on non-US plans),
 * scrolls it into view and focuses its first field, so an empty state or an error can
 * point straight at the next step.
 */
export function openFamilySource(id: string): void {
  if (typeof document === 'undefined') return;
  const el = document.getElementById(id);
  if (!el) return;
  if (el instanceof HTMLDetailsElement) el.open = true;
  el.scrollIntoView?.({ block: 'start' });
  const field = el.querySelector<HTMLElement>('textarea, input:not([type="radio"]):not([disabled])');
  (field ?? el.querySelector<HTMLElement>('summary'))?.focus({ preventScroll: true });
}
