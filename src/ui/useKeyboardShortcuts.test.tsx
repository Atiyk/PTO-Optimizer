import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useKeyboardShortcuts, isEditableTarget } from './useKeyboardShortcuts';

describe('isEditableTarget', () => {
  it('true for a text-entry input (text, date, number)', () => {
    for (const type of ['text', 'date', 'number', 'search', 'email']) {
      const el = document.createElement('input');
      el.type = type;
      expect(isEditableTarget(el)).toBe(true);
    }
  });

  it('true for textarea, select, and contenteditable', () => {
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(document.createElement('select'))).toBe(true);
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    expect(isEditableTarget(div)).toBe(true);
  });

  it('false for range/checkbox/radio/button inputs - these don\'t accept typed characters', () => {
    for (const type of ['range', 'checkbox', 'radio', 'button']) {
      const el = document.createElement('input');
      el.type = type;
      expect(isEditableTarget(el)).toBe(false);
    }
  });

  it('false for a plain element, and for null', () => {
    expect(isEditableTarget(document.createElement('div'))).toBe(false);
    expect(isEditableTarget(document.createElement('button'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

function TestHarness({ onCopyLink, onDownloadIcs }: { onCopyLink: () => void; onDownloadIcs: () => void }) {
  useKeyboardShortcuts({ onCopyLink, onDownloadIcs });
  return null;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function mount(onCopyLink = vi.fn(), onDownloadIcs = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(<TestHarness onCopyLink={onCopyLink} onDownloadIcs={onDownloadIcs} />);
  });
  return { onCopyLink, onDownloadIcs };
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

function press(key: string, target: Element | Window = window, extra: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });
  act(() => {
    target.dispatchEvent(event);
  });
}

describe('useKeyboardShortcuts', () => {
  it('"c" copies the share link', () => {
    const { onCopyLink, onDownloadIcs } = mount();
    press('c');
    expect(onCopyLink).toHaveBeenCalledOnce();
    expect(onDownloadIcs).not.toHaveBeenCalled();
  });

  it('"d" downloads the .ics', () => {
    const { onDownloadIcs } = mount();
    press('d');
    expect(onDownloadIcs).toHaveBeenCalledOnce();
  });

  it('is case-insensitive', () => {
    const { onCopyLink, onDownloadIcs } = mount();
    press('C');
    press('D');
    expect(onCopyLink).toHaveBeenCalledOnce();
    expect(onDownloadIcs).toHaveBeenCalledOnce();
  });

  it('never fires while a modifier key is held, so a browser/OS shortcut is not hijacked', () => {
    const { onDownloadIcs, onCopyLink } = mount();
    press('d', window, { metaKey: true });
    press('c', window, { ctrlKey: true });
    expect(onDownloadIcs).not.toHaveBeenCalled();
    expect(onCopyLink).not.toHaveBeenCalled();
  });

  it('ignores the shortcut while a text input has focus - typing "d" into a field never fires it', () => {
    const { onDownloadIcs } = mount();
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    press('d', input);
    expect(onDownloadIcs).not.toHaveBeenCalled();
    input.remove();
  });

  it('still fires while a range slider has focus - sliders don\'t accept typed characters', () => {
    const { onDownloadIcs } = mount();
    const range = document.createElement('input');
    range.type = 'range';
    document.body.appendChild(range);
    press('d', range);
    expect(onDownloadIcs).toHaveBeenCalledOnce();
    range.remove();
  });
});
