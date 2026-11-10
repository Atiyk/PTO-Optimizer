import { PRODUCT_NAME } from '../brand';
import { logoMarkInner } from './logoMark';

/** Decorative by default. A title gives standalone instances an accessible name. */
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
      dangerouslySetInnerHTML={{ __html: logoMarkInner('currentColor') }}
    />
  );
}

export function Logo({ size = 28, tone = 'light' }: { size?: number; tone?: 'light' | 'dark' }) {
  return (
    <span className={`inline-flex items-center gap-2 ${tone === 'dark' ? 'text-white' : 'text-black'}`}>
      <LogoMark size={size} />
      <span className="type-display text-[24px] leading-none tracking-[-0.025em]">{PRODUCT_NAME}</span>
    </span>
  );
}
