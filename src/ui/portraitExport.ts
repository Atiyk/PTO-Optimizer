import type { Break } from '@daysoff/engine/solver/types';
import { formatDateRange } from '@daysoff/engine/calendar/dateFormat';
import { copyCanvasImage, type ShareImageResult } from './imageExport';

export const PORTRAIT_IMAGE_WIDTH = 1080;
export const PORTRAIT_IMAGE_HEIGHT = 1350;
export const PORTRAIT_MAX_BREAKS = 3;

export type HolidayAssumption = 'public' | 'customized' | 'company';

export interface PortraitPlanData {
  rangeStart: string;
  rangeEnd: string;
  breaks: Pick<Break, 'start' | 'end' | 'ptoCost' | 'totalDaysOff'>[];
  holidayAssumption: HolidayAssumption;
  /** Supply public holiday names only; company dates should be labelled generically. */
  holidayNamesOf?: (brk: PortraitPlanData['breaks'][number]) => string[];
  remainingBalance?: number;
  siteUrl: string;
}

export interface PortraitText {
  title: string;
  range: string;
  summary: string;
  breaks: { dates: string; metrics: string; holidays: string }[];
  overflow: string | null;
  assumption: string;
  balance: string | null;
  site: string;
}

const assumptions: Record<HolidayAssumption, string> = {
  public: 'Assumes your employer observes applicable public holidays.',
  customized: 'Uses a customized employer-observed holiday calendar.',
  company: 'Uses a customized calendar with additional company days off.',
};

/** The entire visible export model. Private balances never enter it without opt-in. */
export function buildPortraitText(data: PortraitPlanData, includeBalance = false): PortraitText {
  const year = data.rangeStart.slice(0, 4);
  const sameYear = year === data.rangeEnd.slice(0, 4);
  const pto = data.breaks.reduce((sum, brk) => sum + brk.ptoCost, 0);
  const days = data.breaks.reduce((sum, brk) => sum + brk.totalDaysOff, 0);
  return {
    title: sameYear ? `My ${year} time-off plan` : 'My time-off plan',
    range: formatDateRange(data.rangeStart, data.rangeEnd),
    summary: `${pto} PTO days → ${days} calendar days off`,
    breaks: data.breaks.slice(0, PORTRAIT_MAX_BREAKS).map(brk => ({
      dates: formatDateRange(brk.start, brk.end),
      metrics: `${brk.totalDaysOff} calendar days off · ${brk.ptoCost} PTO ${brk.ptoCost === 1 ? 'day' : 'days'}`,
      holidays: (data.holidayNamesOf?.(brk) ?? []).length
        ? `Includes: ${[...new Set(data.holidayNamesOf?.(brk))].join(', ')}`
        : 'Weekends and observed holidays included where applicable.',
    })),
    overflow: data.breaks.length > PORTRAIT_MAX_BREAKS
      ? `Plan summary · ${data.breaks.length - PORTRAIT_MAX_BREAKS} additional ${data.breaks.length - PORTRAIT_MAX_BREAKS === 1 ? 'break' : 'breaks'} in the full plan`
      : null,
    assumption: assumptions[data.holidayAssumption],
    balance: includeBalance && Number.isFinite(data.remainingBalance)
      ? `PTO remaining: ${data.remainingBalance} days`
      : null,
    site: data.siteUrl,
  };
}

// 2026-11 redesign palette (src/index.css): paper, ink, pencil, hairline, and the marker.
const colors = { page: '#f4f4f0', card: '#ffffff', ink: '#141414', muted: '#56564f', line: '#dcdcd5', mark: '#dcf763' };

function fitText(ctx: CanvasRenderingContext2D, value: string, maxWidth: number): string {
  if (ctx.measureText(value).width <= maxWidth) return value;
  let fitted = value;
  while (fitted && ctx.measureText(`${fitted}…`).width > maxWidth) fitted = fitted.slice(0, -1);
  return `${fitted.trimEnd()}…`;
}

function wrapText(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, lineHeight: number, maxLines: number) {
  const words = value.split(/\s+/);
  let line = '';
  let lines = 0;
  while (words.length && lines < maxLines) {
    const word = words.shift()!;
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= width) line = next;
    else {
      if (lines === maxLines - 1) { line = `${line} ${word} ${words.join(' ')}`; words.length = 0; }
      else { ctx.fillText(fitText(ctx, line, width), x, y + lines++ * lineHeight); line = word; }
    }
  }
  if (line) ctx.fillText(fitText(ctx, line, width), x, y + lines * lineHeight);
}

export function drawPortraitImage(ctx: CanvasRenderingContext2D, data: PortraitPlanData, includeBalance = false): void {
  const text = buildPortraitText(data, includeBalance);
  ctx.fillStyle = colors.page;
  ctx.fillRect(0, 0, PORTRAIT_IMAGE_WIDTH, PORTRAIT_IMAGE_HEIGHT);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  // The mark: an ink sheet with a marked row and two ink day-blocks (src/ui/logoMark.ts).
  ctx.fillStyle = colors.ink;
  ctx.fillRect(64, 62, 56, 56);
  ctx.fillStyle = colors.mark;
  ctx.fillRect(64, 81, 56, 18);
  ctx.fillStyle = colors.ink;
  ctx.fillRect(81, 85, 9, 10);
  ctx.fillRect(94, 85, 9, 10);
  ctx.fillStyle = colors.ink;
  ctx.font = '700 42px Archivo Variable, system-ui, sans-serif';
  ctx.fillText('Gapless', 140, 106);
  ctx.font = '700 48px Archivo Variable, system-ui, sans-serif';
  ctx.fillText(fitText(ctx, text.title, 952), 64, 209);
  ctx.fillStyle = colors.muted;
  ctx.font = '400 25px Archivo Variable, system-ui, sans-serif';
  ctx.fillText(text.range, 64, 253);
  ctx.font = '800 41px Archivo Variable, system-ui, sans-serif';
  const summary = fitText(ctx, text.summary, 940);
  ctx.fillStyle = colors.mark;
  ctx.fillRect(58, 296, Math.min(ctx.measureText(summary).width + 12, 964), 44);
  ctx.fillStyle = colors.ink;
  ctx.fillText(summary, 64, 330);
  ctx.fillStyle = colors.muted;
  ctx.font = '400 21px Archivo Variable, system-ui, sans-serif';
  ctx.fillText('Calendar days off include weekends, observed holidays, and PTO.', 64, 367);

  text.breaks.forEach((brk, index) => {
    const y = 402 + index * 224;
    ctx.fillStyle = colors.card;
    ctx.fillRect(64, y, 952, 204);
    ctx.strokeStyle = colors.line;
    ctx.lineWidth = 2;
    ctx.strokeRect(64, y, 952, 204);
    ctx.fillStyle = colors.mark;
    ctx.fillRect(64, y, 10, 204);
    ctx.fillStyle = colors.ink;
    ctx.font = '650 35px Archivo Variable, system-ui, sans-serif';
    ctx.fillText(fitText(ctx, brk.dates, 872), 100, y + 54);
    ctx.fillStyle = colors.ink;
    ctx.font = '650 29px Archivo Variable, system-ui, sans-serif';
    ctx.fillText(brk.metrics, 100, y + 103);
    ctx.fillStyle = colors.muted;
    ctx.font = '400 22px Archivo Variable, system-ui, sans-serif';
    wrapText(ctx, brk.holidays, 100, y + 145, 872, 29, 2);
  });
  ctx.fillStyle = colors.muted;
  ctx.font = '400 23px Archivo Variable, system-ui, sans-serif';
  if (text.overflow) ctx.fillText(text.overflow, 64, 1115);
  if (text.balance) ctx.fillText(text.balance, 64, 1154);
  wrapText(ctx, text.assumption, 64, 1210, 952, 30, 2);
  ctx.fillStyle = colors.line;
  ctx.fillRect(64, 1260, 952, 2);
  ctx.fillStyle = colors.ink;
  ctx.font = '500 24px Archivo Variable, system-ui, sans-serif';
  ctx.fillText(fitText(ctx, text.site, 952), 64, 1303);
}

export function renderPortraitCanvas(data: PortraitPlanData, includeBalance = false): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = PORTRAIT_IMAGE_WIDTH;
  canvas.height = PORTRAIT_IMAGE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image preview is unavailable in this browser.');
  drawPortraitImage(ctx, data, includeBalance);
  return canvas;
}

export async function copyPortraitImage(canvas: HTMLCanvasElement): Promise<ShareImageResult> {
  return copyCanvasImage(canvas, 'gapless-time-off-portrait.png');
}

export async function downloadPortraitImage(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return false;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'gapless-time-off-portrait.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch { return false; }
}
