import { logoMarkInner } from './logoMark';

/** The mark alone: the bridged G. Decorative by default (the wordmark or a link label names it). */
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

/**
 * The lockup: the mark, "gapless" set lowercase in Archivo 760 at 88% width, and the product
 * line "PTO Optimizer" in graphite on the same baseline. `tone="dark"` is for ink grounds (the
 * footer). The visible text reads "Gapless PTO Optimizer" to assistive tech: the wordmark's
 * lowercase is styling only (text-transform), so the accessible name keeps the real name.
 */
export function Logo({ size = 28, tone = 'light', compact = false }: { size?: number; tone?: 'light' | 'dark'; compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} />
      <span className="flex min-w-0 items-baseline gap-1.5 leading-none">
        <span className={`type-display lowercase text-[24px] tracking-[-0.035em] ${tone === 'dark' ? 'text-white' : 'text-ink'}`}>Gapless{' '}</span>
        <span className={`${compact ? 'hidden sm:inline' : ''} text-[13px] font-medium ${tone === 'dark' ? 'text-[#c3c7d0]' : 'text-muted'}`}>PTO Optimizer{' '}</span>
      </span>
    </span>
  );
}
