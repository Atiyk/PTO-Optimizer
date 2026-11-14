import { describe, it, expect, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { SummaryMetrics } from './SummaryMetrics';
import type { Scores } from '@daysoff/engine/solver/types';

describe('SummaryMetrics', () => {
  const scores: Scores = { efficiency: { percentile: 91 }, travel: { percentile: 78 } };

  it('explains every figure in plain language instead of bare pills', () => {
    const html = renderToStaticMarkup(
      <SummaryMetrics budgetSpent={12} totalDaysOff={27} breakCountActual={3} scores={scores} />,
    );
    // The multiplier (27 / 12 = 2.25) says what it means without restating the headline (F12).
    expect(html).toContain('2.25×');
    expect(html).toContain('Days off, weekends and holidays included, for each PTO day you spend.');
    expect(html).not.toContain('27 days off for 12 PTO days');
    // Display only broad context and its source, even when the engine returns an internal percentile.
    expect(html).not.toContain('Efficiency percentile');
    expect(html).not.toContain('78th');
    // Outside the US there is no country travel data, so the tile is hidden rather than
    // showing an uninformative "generic seasonal estimate" (F24).
    expect(html).not.toContain('Travel estimate');
    expect(html).not.toMatch(/generic seasonal|Seasonal/);
    expect(html).toContain('grid-cols-1');
    const us = renderToStaticMarkup(<SummaryMetrics budgetSpent={12} totalDaysOff={27} breakCountActual={3} scores={scores} travelBasis="us" />);
    expect(us).toContain('2025 US airport checkpoint counts');
    expect(us).toContain('Quieter');
    expect(us).toContain('Travel estimate');
    expect(us).toContain('grid-cols-2');
    expect(us).not.toContain('78th');
  });

  it('renders the raw counts without an unsupported ordinal', () => {
    const html = renderToStaticMarkup(
      <SummaryMetrics budgetSpent={12} totalDaysOff={33} breakCountActual={9} scores={scores} />,
    );
    expect(html).toContain('2.75×');
    expect(html).not.toContain('in 9 breaks');
    expect(html).not.toContain('78th');
    expect(html).not.toContain('91st');
  });

  it('falls back to an em dash for Travel/Efficiency when scores are not yet available', () => {
    const html = renderToStaticMarkup(
      <SummaryMetrics budgetSpent={0} totalDaysOff={0} breakCountActual={0} scores={null} />,
    );
    expect(html).toContain('—');
    expect(html).not.toMatch(/\d{2,3}(th|st|nd|rd)/);
  });

  it('says the travel tile shows once the plan is ready, without "solved" jargon (F24/F05)', () => {
    const html = renderToStaticMarkup(
      <SummaryMetrics budgetSpent={1} totalDaysOff={4} breakCountActual={1} scores={null} travelBasis="us" />,
    );
    expect(html).toContain('Shows once your plan is ready.');
    expect(html).not.toMatch(/solved/i);
  });
});

describe('SummaryMetrics motion (metrics crossfade/pulse on change rather than snapping)', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    container = null;
    root = null;
    vi.useRealTimers();
  });

  it('pulses only the tile whose own value changed, and clears within 200ms (never snaps silently, never lingers)', () => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    const testScores: Scores = { efficiency: { percentile: 91 }, travel: { percentile: 78 } };
    act(() => {
      root!.render(<SummaryMetrics budgetSpent={12} totalDaysOff={33} breakCountActual={9} scores={testScores} />);
    });
    const tiles = () => Array.from(container!.querySelectorAll('[data-figure]')).filter((s) => s.className.includes('bg-accent-soft'));
    expect(tiles()).toHaveLength(0);

    // Only totalDaysOff changes - budgetSpent/breakCountActual/scores stay the same.
    act(() => {
      root!.render(<SummaryMetrics budgetSpent={12} totalDaysOff={34} breakCountActual={9} scores={testScores} />);
    });
    // totalDaysOff drives the days-per-PTO figure (33/12 -> 34/12), the only figure that moved.
    expect(tiles()).toHaveLength(1);
    expect(tiles()[0].textContent).toBe('2.83×');

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(tiles()).toHaveLength(0);
  });
});
