import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WeightingSlider } from './WeightingSlider';

describe('WeightingSlider (Phase 5.2: "don\'t assume travel")', () => {
  it('shows a line clarifying the slider is about demand, not whether the user is travelling at all', () => {
    const html = renderToStaticMarkup(<WeightingSlider value={30} onChange={() => {}} />);
    expect(html).toContain('Not travelling?');
    expect(html).toContain('Set this toward 0');
  });

  it('still renders the caption for the current value alongside the new line', () => {
    const html = renderToStaticMarkup(<WeightingSlider value={0} onChange={() => {}} />);
    expect(html).toContain('maximise days off, ignore travel demand');
    expect(html).toContain('Not travelling?');
  });
});
