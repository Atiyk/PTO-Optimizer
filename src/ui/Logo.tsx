import { PRODUCT_NAME, PRODUCT_SHORT_NAME } from '../brand';
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

/**
 * Mark + wordmark. The full name from 400px up, the short name below it (D1), switched in
 * CSS so the prerendered HTML is the same at every width and nothing shifts on hydration.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="whitespace-nowrap text-[17px] font-semibold leading-none tracking-[-0.01em] text-ink">
        <span className="max-[399px]:hidden">{PRODUCT_NAME}</span>
        <span className="min-[400px]:hidden">{PRODUCT_SHORT_NAME}</span>
      </span>
    </span>
  );
}
