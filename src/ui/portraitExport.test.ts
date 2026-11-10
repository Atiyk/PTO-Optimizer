import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPortraitText, drawPortraitImage, PORTRAIT_IMAGE_HEIGHT, PORTRAIT_IMAGE_WIDTH, renderPortraitCanvas, type PortraitPlanData } from './portraitExport';

const data: PortraitPlanData = {
  rangeStart: '2027-01-01', rangeEnd: '2027-12-31', holidayAssumption: 'customized',
  breaks: [{ start: '2027-07-03', end: '2027-07-11', ptoCost: 4, totalDaysOff: 9 }],
  holidayNamesOf: () => ['Independence Day'], remainingBalance: 98123.75, siteUrl: 'gapless.example',
};

const drawingMethods = () => ({
  save: vi.fn(), restore: vi.fn(), translate: vi.fn(), scale: vi.fn(),
  fill: vi.fn(), beginPath: vi.fn(), roundRect: vi.fn(),
});

describe('portrait share image', () => {
  beforeEach(() => vi.stubGlobal('Path2D', class MockPath2D {}));
  afterEach(() => vi.unstubAllGlobals());
  it('uses the requested 1080 × 1350 portrait dimensions', () => {
    const context = { ...drawingMethods(), fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(), measureText: () => ({ width: 100 }) };
    const canvas = { width: 0, height: 0, getContext: () => context };
    const spy = vi.spyOn(document, 'createElement').mockReturnValueOnce(canvas as unknown as HTMLCanvasElement);
    expect(renderPortraitCanvas(data)).toMatchObject({ width: 1080, height: 1350 });
    expect(PORTRAIT_IMAGE_WIDTH / PORTRAIT_IMAGE_HEIGHT).toBe(4 / 5);
    spy.mockRestore();
  });

  it('does not place the balance in the visible model or pixels unless opted in', () => {
    expect(buildPortraitText(data).balance).toBeNull();
    expect(JSON.stringify(buildPortraitText(data))).not.toContain('98123.75');
    const fillText = vi.fn();
    const context = { ...drawingMethods(), fillRect: vi.fn(), strokeRect: vi.fn(), fillText, measureText: () => ({ width: 100 }) } as unknown as CanvasRenderingContext2D;
    drawPortraitImage(context, data);
    expect(fillText.mock.calls.map(call => call[0]).join(' ')).not.toContain('98123.75');
    drawPortraitImage(context, data, true);
    expect(fillText.mock.calls.map(call => call[0]).join(' ')).toContain('PTO remaining: 98123.75 days');
  });

  it('uses plan costs, date range and employer holiday assumptions', () => {
    const text = buildPortraitText(data);
    expect(text.title).toBe('My 2027 time-off plan');
    expect(text.summary).toBe('4 PTO days → 9 calendar days off');
    expect(text.breaks[0]).toEqual({ dates: 'Jul 3 - Jul 11, 2027', metrics: '9 calendar days off · 4 PTO days', holidays: 'Includes: Independence Day' });
    expect(text.assumption).toContain('customized employer-observed');
    expect(buildPortraitText({ ...data, holidayAssumption: 'company' }).assumption).toContain('additional company days');
    expect(buildPortraitText({ ...data, holidayAssumption: 'public' }).assumption).toContain('public holidays');
  });

  it('labels truncated plans explicitly and preserves totals from the full plan', () => {
    const text = buildPortraitText({ ...data, breaks: Array.from({ length: 5 }, () => data.breaks[0]) });
    expect(text.breaks).toHaveLength(3);
    expect(text.overflow).toBe('Plan summary · 2 additional breaks in the full plan');
    expect(text.summary).toBe('20 PTO days → 45 calendar days off');
  });

  it('uses years on cross-year dates and never hides overflow behind canvas bounds', () => {
    const fillText = vi.fn();
    const context = { ...drawingMethods(), fillRect: vi.fn(), strokeRect: vi.fn(), fillText, measureText: (value: string) => ({ width: value.length * 15 }) } as unknown as CanvasRenderingContext2D;
    const crossYear = { ...data, rangeStart: '2026-12-01', breaks: Array.from({ length: 4 }, () => ({ start: '2026-12-28', end: '2027-01-03', ptoCost: 4, totalDaysOff: 7 })), holidayNamesOf: () => ['An unusually long holiday name '.repeat(15)] };
    const text = buildPortraitText(crossYear);
    expect(text.title).toBe('My time-off plan');
    expect(text.breaks[0].dates).toContain('2026');
    expect(text.breaks[0].dates).toContain('2027');
    drawPortraitImage(context, crossYear, true);
    for (const [, x, y] of fillText.mock.calls) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(PORTRAIT_IMAGE_WIDTH);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(PORTRAIT_IMAGE_HEIGHT);
    }
    expect(fillText.mock.calls.some(call => String(call[0]).includes('additional break'))).toBe(true);
  });
});
