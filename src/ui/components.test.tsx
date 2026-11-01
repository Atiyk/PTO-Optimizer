import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from './Button';
import { Chip } from './Chip';
import { Callout } from './Callout';
import { StatNumber } from './StatNumber';
import { Countdown, countdownText } from './Countdown';
import { LogoMark } from './Logo';

describe('Phase 1 components', () => {
  it('Button renders a real link when given href, and a non-submit button otherwise', () => {
    expect(renderToStaticMarkup(<Button href="/pto">Go</Button>)).toMatch(/^<a href="\/pto"/);
    expect(renderToStaticMarkup(<Button>Copy</Button>)).toContain('type="button"');
  });

  it('a toggle Chip carries its state in aria-pressed and a check mark, not colour alone', () => {
    const on = renderToStaticMarkup(<Chip onClick={() => undefined} selected>On</Chip>);
    const off = renderToStaticMarkup(<Chip onClick={() => undefined} selected={false}>Off</Chip>);
    expect(on).toContain('aria-pressed="true"');
    expect(on).toContain('<svg');
    expect(off).toContain('aria-pressed="false"');
    expect(off).not.toContain('<svg');
  });

  it('Callout shows its "why" line', () => {
    expect(renderToStaticMarkup(<Callout title="Fri 27 Nov" why="bridges Thanksgiving" />)).toContain('Why: </span>bridges Thanksgiving');
  });

  it('StatNumber renders the value with tabular figures and no animation on first render', () => {
    const html = renderToStaticMarkup(<StatNumber value={38} label="days off" />);
    expect(html).toContain('>38<');
    expect(html).toContain('tabular-nums');
    expect(html).not.toContain('animate-');
  });

  it('Countdown words the engine number', () => {
    expect(countdownText(0)).toBe('today');
    expect(countdownText(1)).toBe('tomorrow');
    expect(countdownText(26)).toBe('in 26 days');
    expect(renderToStaticMarkup(<Countdown days={26} date="2026-11-26" />)).toContain('dateTime="2026-11-26"');
  });

  it('LogoMark is decorative unless titled', () => {
    expect(renderToStaticMarkup(<LogoMark />)).toContain('aria-hidden="true"');
    expect(renderToStaticMarkup(<LogoMark title="Gapless" />)).toContain('role="img"');
  });
});
