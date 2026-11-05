import { logoMarkInner } from './logoMark';

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

/** The wordmark: the mark, "Gapless" set condensed and heavy, and the product line beneath it
 * in plain sentence case (no tracked caps). */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="flex min-w-0 flex-col leading-none text-ink">
        <span className="type-display text-[23px] tracking-[-0.01em]">Gapless{' '}</span>
        <span className="mt-[3px] text-[12px] font-semibold text-muted">PTO Optimizer{' '}</span>
      </span>
    </span>
  );
}
