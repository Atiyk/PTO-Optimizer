import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';

describe('KeyboardShortcutsHelp', () => {
  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(<KeyboardShortcutsHelp open={false} onClose={() => {}} />);
    expect(html).toBe('');
  });

  it('lists all four shortcuts when open', () => {
    const html = renderToStaticMarkup(<KeyboardShortcutsHelp open onClose={() => {}} />);
    expect(html).toContain('Adjust the focused slider');
    expect(html).toContain('Copy share link');
    expect(html).toContain('Download .ics');
    expect(html).toContain('Show this list');
  });
});
