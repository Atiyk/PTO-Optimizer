import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PeakCapBanner, peakCapMessage } from './PeakCapBanner';

describe('peakCapMessage', () => {
  it('names the max days, the window, and that the rest moved elsewhere', () => {
    const text = peakCapMessage(5, '2026-06-01', '2026-08-31');
    expect(text).toContain('Capped at 5 days');
    expect(text).toContain('Jun 1');
    expect(text).toContain('Aug 31');
    expect(text).toContain('moved elsewhere');
  });

  it('singular "day" for a cap of exactly 1', () => {
    expect(peakCapMessage(1, '2026-06-01', '2026-08-31')).toContain('Capped at 1 day ');
  });
});

describe('PeakCapBanner', () => {
  it('renders nothing when the cap was not actually applied', () => {
    const html = renderToStaticMarkup(
      <PeakCapBanner applied={false} maxDays={5} startDate="2026-06-01" endDate="2026-08-31" />,
    );
    expect(html).toBe('');
  });

  it('renders the message when the cap was applied', () => {
    const html = renderToStaticMarkup(
      <PeakCapBanner applied={true} maxDays={5} startDate="2026-06-01" endDate="2026-08-31" />,
    );
    expect(html).toContain('Capped at 5 days');
  });
});
