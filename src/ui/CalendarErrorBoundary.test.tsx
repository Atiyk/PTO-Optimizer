import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CalendarErrorBoundary } from './CalendarErrorBoundary';

// renderToStaticMarkup (legacy synchronous SSR, the only rendering this project's test
// suite uses - see NOTES.md on why no React Testing Library was added) does not run
// React's commit-phase error-boundary machinery: getDerivedStateFromError/componentDidCatch
// simply don't fire there, so a thrown error propagates past the boundary instead of being
// caught - confirmed by trying it; the error surfaces as an uncaught exception from the
// render call itself. The catch-and-recover behaviour is therefore verified LIVE in a real
// browser instead (see NOTES.md's Phase 5 section) rather than left unverified; this test
// only covers the one thing static rendering CAN check - the non-error path.
describe('CalendarErrorBoundary', () => {
  it('renders children normally when nothing throws', () => {
    const html = renderToStaticMarkup(
      <CalendarErrorBoundary>
        <div>calendar content</div>
      </CalendarErrorBoundary>,
    );
    expect(html).toContain('calendar content');
  });
});
