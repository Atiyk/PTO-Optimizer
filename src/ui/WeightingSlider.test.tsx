import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WeightingSlider } from './WeightingSlider';

describe('WeightingSlider (Phase 5.2: "don\'t assume travel")', () => {
  it('carries the "not travelling" clarification as a hover/focus hint on the label, not a standalone line', () => {
    const html = renderToStaticMarkup(<WeightingSlider value={30} onChange={() => {}} />);
    expect(html).toContain('aria-label="Not travelling?');
    expect(html).toContain('Set this toward 0');
  });

  it('still renders the caption for the current value alongside the hint', () => {
    const html = renderToStaticMarkup(<WeightingSlider value={0} onChange={() => {}} />);
    expect(html).toContain('maximise days off, ignore travel demand');
    expect(html).toContain('Not travelling?');
  });
});
