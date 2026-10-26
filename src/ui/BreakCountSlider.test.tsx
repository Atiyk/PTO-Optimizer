import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BreakCountSlider } from './BreakCountSlider';

describe('BreakCountSlider (Phase 3.3: captions reframed around workload, mechanism unchanged)', () => {
  it('labels the two slider ends around workload/recovery, with the full reasoning in a hover hint', () => {
    const html = renderToStaticMarkup(
      <BreakCountSlider
        value={4}
        onChange={() => {}}
        letSolverDecide={false}
        onToggleLetSolverDecide={() => {}}
        breaks={[]}
        breakCountRequested={4}
        breakCountActual={4}
        budget={15}
      />,
    );
    expect(html).toContain('One big break');
    expect(html).toContain('Many short breaks');
    expect(html).toContain('title="One big break means more disruption but more recovery time.');
    // The old, purely structural labels are gone.
    expect(html).not.toContain('All in one</span>');
    expect(html).not.toContain('>As many as possible<');
  });

  it('the slider mechanism itself (range input, 1-7) is unchanged', () => {
    const html = renderToStaticMarkup(
      <BreakCountSlider
        value={4}
        onChange={() => {}}
        letSolverDecide={false}
        onToggleLetSolverDecide={() => {}}
        breaks={[]}
        breakCountRequested={4}
        breakCountActual={4}
        budget={15}
      />,
    );
    expect(html).toContain('type="range"');
    expect(html).toContain('min="1"');
    expect(html).toContain('max="7"');
  });
});
