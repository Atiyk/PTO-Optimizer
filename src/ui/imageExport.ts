import { buildMonths, monthLabel, type WeekStart } from '@daysoff/engine/calendar/calendarMath';
import type { DayCategory } from './types';

export const SHARE_IMAGE_WIDTH = 1200;
export const SHARE_IMAGE_HEIGHT = 630;

// Hex equivalents of the live calendar's Tailwind tokens (colorScheme.ts, scheme B) -
// canvas can't read Tailwind classes, so these are kept in lockstep by hand. Same two
// colours as the live calendar (PTO role + band role) plus the one neutral holiday dot.
const COLOR = {
  bg: '#f8fafc', // --bg-page (2026-11 brand overhaul tokens, src/index.css)
  textPrimary: '#1b2935', // --text-primary
  textMuted: '#536575', // --text-muted
  gridLine: '#dce3ea', // --border-default
  ptoFill: '#245da6', // --pto-bg
  ptoText: '#ffffff',
  bandFill: '#e9f1fb', // --band-bg
  holidayDot: '#536575', // --holiday-dot
  cellPlain: '#ffffff', // --bg-surface
};

export interface ShareImageMonth {
  label: string;
  weekStart: WeekStart;
  weeks: (string | null)[][];
}

export interface ShareImageData {
  headline: string;
  subtitle: string;
  months: ShareImageMonth[];
  categoryOf: (iso: string) => DayCategory;
  isOutOfRange: (iso: string) => boolean;
  siteUrl: string;
}

/** Drops wholly-blank trailing rows so a 4-week February doesn't carry two empty rows of
 * padding into a compact export image (buildMonths always pads to 6 rows for the live grid,
 * where fixed height matters; the export has no such constraint). */
function trimBlankTrailingRows(weeks: (string | null)[][]): (string | null)[][] {
  let end = weeks.length;
  while (end > 0 && weeks[end - 1].every((c) => c === null)) end--;
  return weeks.slice(0, end);
}

/** Builds the month grids the share image should show: only months containing at least one
 * suggested-PTO or pinned day - per spec, "the months containing suggestions" - trimmed of
 * trailing blank rows. */
export function buildShareImageMonths(
  rangeStart: string,
  rangeEnd: string,
  weekStart: WeekStart,
  categoryOf: (iso: string) => DayCategory,
): ShareImageMonth[] {
  const months = buildMonths(rangeStart, rangeEnd, weekStart);
  const result: ShareImageMonth[] = [];
  for (const m of months) {
    const hasSuggestion = m.weeks
      .flat()
      .some((iso) => iso !== null && iso >= rangeStart && iso <= rangeEnd && ['suggested-pto', 'pinned'].includes(categoryOf(iso)));
    if (!hasSuggestion) continue;
    result.push({ label: monthLabel(m.year, m.month), weekStart, weeks: trimBlankTrailingRows(m.weeks) });
  }
  return result;
}

function drawMonthGrid(
  ctx: CanvasRenderingContext2D,
  month: ShareImageMonth,
  x: number,
  y: number,
  boxWidth: number,
  categoryOf: (iso: string) => DayCategory,
  isOutOfRange: (iso: string) => boolean,
): number {
  const cell = Math.floor(boxWidth / 7);
  const headerH = 22;
  const dowH = 16;

  ctx.fillStyle = COLOR.textPrimary;
  ctx.font = '600 15px Archivo Variable, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(month.label, x, y + 15);

  const dowLabels = month.weekStart === 0 ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  ctx.font = '500 10px Archivo Variable, system-ui, sans-serif';
  ctx.fillStyle = COLOR.textMuted;
  ctx.textAlign = 'center';
  for (let i = 0; i < 7; i++) {
    ctx.fillText(dowLabels[i], x + i * cell + cell / 2, y + headerH + 11);
  }

  let rowY = y + headerH + dowH;
  for (const week of month.weeks) {
    for (let col = 0; col < 7; col++) {
      const iso = week[col];
      const cx = x + col * cell;
      if (!iso || isOutOfRange(iso)) continue;
      const category = categoryOf(iso);
      const day = Number(iso.slice(8, 10));
      const isPtoLike = category === 'suggested-pto' || category === 'pinned';
      const isWeekendOrHoliday = category === 'weekend' || category === 'public-holiday';

      if (isPtoLike) {
        ctx.fillStyle = COLOR.ptoFill;
        ctx.fillRect(cx + 1, rowY + 1, cell - 2, cell - 2);
        ctx.fillStyle = COLOR.ptoText;
      } else if (isWeekendOrHoliday) {
        ctx.fillStyle = COLOR.bandFill;
        ctx.fillRect(cx + 1, rowY + 1, cell - 2, cell - 2);
        ctx.fillStyle = COLOR.textPrimary;
      } else {
        ctx.fillStyle = COLOR.textMuted;
      }

      ctx.font = '400 10px Archivo Variable, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(day), cx + cell / 2, rowY + cell / 2 + 3);

      if (category === 'public-holiday') {
        ctx.fillStyle = COLOR.holidayDot;
        ctx.beginPath();
        ctx.arc(cx + cell / 2, rowY + cell - 4, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    rowY += cell;
  }

  return headerH + dowH + month.weeks.length * cell;
}

export function drawShareImage(ctx: CanvasRenderingContext2D, data: ShareImageData): void {
  ctx.fillStyle = COLOR.bg;
  ctx.fillRect(0, 0, SHARE_IMAGE_WIDTH, SHARE_IMAGE_HEIGHT);

  const PAD = 48;

  ctx.fillStyle = COLOR.textPrimary;
  ctx.font = '800 46px Archivo Variable, system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(data.headline, PAD, PAD + 44);

  ctx.font = '400 22px Archivo Variable, system-ui, sans-serif';
  ctx.fillStyle = COLOR.textMuted;
  ctx.fillText(data.subtitle, PAD, PAD + 80);

  const gridTop = PAD + 112;
  const gridBottom = SHARE_IMAGE_HEIGHT - 56;
  const gridAreaHeight = gridBottom - gridTop;
  const gridAreaWidth = SHARE_IMAGE_WIDTH - PAD * 2;

  const n = Math.max(1, data.months.length);
  const cols = Math.min(n, n <= 4 ? n : 4);
  const rows = Math.ceil(n / cols);
  const colGap = 32;
  const rowGap = 20;
  const boxWidth = (gridAreaWidth - colGap * (cols - 1)) / cols;
  const boxHeight = (gridAreaHeight - rowGap * (rows - 1)) / rows;

  data.months.forEach((month, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = PAD + col * (boxWidth + colGap);
    const y = gridTop + row * (boxHeight + rowGap);
    drawMonthGrid(ctx, month, x, y, boxWidth, data.categoryOf, data.isOutOfRange);
  });

  // Legend, bottom-left.
  const legendY = SHARE_IMAGE_HEIGHT - 36;
  let legendX = PAD;
  const legendItems: { color: string; label: string; dot?: boolean }[] = [
    { color: COLOR.ptoFill, label: 'Suggested PTO' },
    { color: COLOR.bandFill, label: 'Days off' },
  ];
  ctx.font = '400 13px Archivo Variable, system-ui, sans-serif';
  for (const item of legendItems) {
    ctx.fillStyle = item.color;
    ctx.fillRect(legendX, legendY - 10, 14, 14);
    ctx.fillStyle = COLOR.textMuted;
    ctx.textAlign = 'left';
    ctx.fillText(item.label, legendX + 20, legendY + 1);
    legendX += 20 + ctx.measureText(item.label).width + 24;
  }

  // Site URL, bottom-right.
  ctx.font = '400 14px Archivo Variable, system-ui, sans-serif';
  ctx.fillStyle = COLOR.textMuted;
  ctx.textAlign = 'right';
  ctx.fillText(data.siteUrl, SHARE_IMAGE_WIDTH - PAD, legendY + 1);
}

export function renderShareImageCanvas(data: ShareImageData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_IMAGE_WIDTH;
  canvas.height = SHARE_IMAGE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  drawShareImage(ctx, data);
  return canvas;
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export type ShareImageResult = { method: 'clipboard' } | { method: 'download' } | { method: 'failed' };

/**
 * Copies any canvas to the clipboard as a PNG. Safari restricts clipboard image writes
 * (ClipboardItem with an async blob factory is required there, and even that can be refused
 * outside a direct user gesture), so any failure - missing API, thrown error, refused
 * permission - falls back to triggering a file download instead of failing silently. Shared
 * by every image export in the app (the PTO-plan calendar image below, and the landing
 * page's countdown/year-strip image) so this cross-browser handling exists exactly once.
 */
export async function copyCanvasImage(canvas: HTMLCanvasElement, filename: string): Promise<ShareImageResult> {
  const blob = await canvasToBlob(canvas);
  if (!blob) return { method: 'failed' };

  if (typeof window !== 'undefined' && 'ClipboardItem' in window && navigator.clipboard && 'write' in navigator.clipboard) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return { method: 'clipboard' };
    } catch {
      // fall through to download
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return { method: 'download' };
  } catch {
    return { method: 'failed' };
  }
}

/** The PTO plan's own "Copy as image" export - renders the calendar-grid canvas, then
 * hands off to the shared copy/download-fallback logic above. */
export async function copyShareImage(data: ShareImageData, filename = 'pto-plan.png'): Promise<ShareImageResult> {
  return copyCanvasImage(renderShareImageCanvas(data), filename);
}
