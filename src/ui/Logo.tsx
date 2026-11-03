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

/** Clear hierarchy, one Figtree font, consistent across every viewport. */
export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="flex min-w-0 flex-col leading-none text-ink">
        <span className="text-[21px] font-extrabold tracking-[-0.055em]">Gapless</span>
        <span className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-muted">PTO Optimizer</span>
      </span>
    </span>
  );
}
