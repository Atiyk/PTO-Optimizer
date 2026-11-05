import { logoMarkInner } from './logoMark';
import { WORDMARK_BAND, WORDMARK_PATH, WORDMARK_VIEWBOX } from './logoOutlines';

/** The mark alone. Decorative by default (the wordmark or a link label names it). */
export function LogoMark({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      className="shrink-0"
      dangerouslySetInnerHTML={{ __html: logoMarkInner() }}
    />
  );
}

const VB = WORDMARK_VIEWBOX;

/** "Gapless", outlined from the display face, with the marker stroke under its baseline. The
 * letters take `currentColor`; the stroke is the marker token. Named for assistive tech. */
export function Wordmark({ height = 21, className = '' }: { height?: number; className?: string }) {
  return (
    <svg
      height={height}
      width={(height * VB.width) / VB.height}
      viewBox={`${VB.x} ${VB.y} ${VB.width} ${VB.height}`}
      role="img"
      aria-label="Gapless"
      focusable="false"
      className={`block shrink-0 ${className}`}
    >
      <title>Gapless</title>
      <rect x={WORDMARK_BAND.x} y={WORDMARK_BAND.y} width={WORDMARK_BAND.width} height={WORDMARK_BAND.height} fill="var(--mark, #dcf763)" />
      <path d={WORDMARK_PATH} fill="currentColor" />
    </svg>
  );
}

/** The lockup: the mark, the wordmark, and the product line beneath it in plain sentence case
 * (no tracked caps). */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="flex min-w-0 flex-col leading-none text-ink">
        <Wordmark height={21} />
        <span className="mt-[2px] text-[12px] font-semibold text-muted">PTO Optimizer{' '}</span>
      </span>
    </span>
  );
}
