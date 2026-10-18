import { describe, it, expect } from 'vitest';
import { buildShareImageMonths, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT } from './imageExport';
import type { DayCategory } from './types';

describe('imageExport', () => {
  it('is fixed at 1200x630 so it renders correctly on every social platform', () => {
    expect(SHARE_IMAGE_WIDTH).toBe(1200);
    expect(SHARE_IMAGE_HEIGHT).toBe(630);
  });

  describe('buildShareImageMonths', () => {
    it('only includes months that contain at least one suggested-PTO or pinned day', () => {
      const ptoDates = new Set(['2026-10-26']);
      const categoryOf = (iso: string): DayCategory => (ptoDates.has(iso) ? 'suggested-pto' : 'working');
      const months = buildShareImageMonths('2026-10-18', '2026-12-31', 1, categoryOf);
      const labels = months.map((m) => m.label);
      expect(labels).toEqual(['October 2026']); // November/December have no suggestions, excluded
    });

    it('includes a month where the only PTO-like day is pinned, not solver-suggested', () => {
      const categoryOf = (iso: string): DayCategory => (iso === '2026-11-04' ? 'pinned' : 'working');
      const months = buildShareImageMonths('2026-10-18', '2026-12-31', 1, categoryOf);
      expect(months.map((m) => m.label)).toEqual(['November 2026']);
    });

    it('trims wholly-blank trailing rows (e.g. a 4-week February) for a compact export', () => {
      const categoryOf = (): DayCategory => 'suggested-pto'; // force every month in
      const months = buildShareImageMonths('2026-02-01', '2026-02-28', 1, categoryOf);
      const [february] = months;
      // Feb 2026 needs only 4 rows of real content - the trailing padding rows must be gone.
      expect(february.weeks.length).toBeLessThanOrEqual(5);
      expect(february.weeks.every((w) => w.some((c) => c !== null))).toBe(true);
    });

    it('returns an empty list when nothing in the range qualifies, never throwing', () => {
      const categoryOf = (): DayCategory => 'working';
      expect(() => buildShareImageMonths('2026-10-18', '2026-12-31', 1, categoryOf)).not.toThrow();
      expect(buildShareImageMonths('2026-10-18', '2026-12-31', 1, categoryOf)).toEqual([]);
    });
  });
});
