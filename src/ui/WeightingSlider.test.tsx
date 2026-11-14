import { describe, it, expect, afterEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { cleanup, render, screen } from '@testing-library/react';
import { WeightingSlider } from './WeightingSlider';
import { weightingCaption, weightingShort } from './weightingCaptions';

afterEach(cleanup);

const STEPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

describe('WeightingSlider (Phase 5.2: "don\'t assume travel")', () => {
  it('carries the "not traveling" clarification as a hover/focus hint on the label, not a standalone line', () => {
    const html = renderToStaticMarkup(<WeightingSlider value={30} onChange={() => {}} />);
    expect(html).toContain('aria-label="Not traveling?');
    expect(html).toContain('Set this toward Most days off');
  });

  it('still renders the caption for the current value alongside the hint', () => {
    const html = renderToStaticMarkup(<WeightingSlider value={0} onChange={() => {}} />);
    expect(html).toContain('Maximize days off, ignore travel demand');
    expect(html).toContain('Not traveling?');
  });
});

describe('WeightingSlider copy (F13)', () => {
  it('uses American spelling at every step, in the visible caption, the hint and aria-valuetext', () => {
    for (const value of STEPS) {
      const html = renderToStaticMarkup(<WeightingSlider value={value} onChange={() => {}} />);
      expect(html, `w=${value}`).not.toMatch(/maximis|prioritis|travelling|favour/i);
    }
  });

  it('shows the setting in words, never the bare slider number', () => {
    render(<WeightingSlider value={30} onChange={() => {}} />);
    expect(screen.queryByText('30')).toBeNull();
    expect(screen.getByText('Mostly days off, with a slight pull toward quieter travel weeks')).toBeTruthy();
  });

  it('announces the words, not the number, and keeps the numeric value on the input', () => {
    for (const value of STEPS) {
      cleanup();
      render(<WeightingSlider value={value} onChange={() => {}} />);
      const slider = screen.getByRole('slider', { name: 'What matters more?' }) as HTMLInputElement;
      expect(slider.value).toBe(String(value));
      const text = slider.getAttribute('aria-valuetext') ?? '';
      expect(text, `w=${value}`).toMatch(/^[A-Z][a-z]/);
      expect(text).not.toMatch(/\d/);
    }
  });
});

describe('weighting captions (P1 copy)', () => {
  it('has a plain caption and a short form at every step, with no vague "estimated periods"', () => {
    for (const value of STEPS) {
      expect(weightingCaption(value), `w=${value}`).not.toMatch(/estimated periods|maximizing/);
      expect(weightingShort(value), `w=${value}`).toMatch(/^[a-z]/);
      expect(weightingShort(value).split(' ').length).toBeLessThanOrEqual(6);
    }
    expect(weightingShort(30)).toBe('mostly days off');
    expect(weightingShort(33)).toBe('mostly days off');
  });
});
