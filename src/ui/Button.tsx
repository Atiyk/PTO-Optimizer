import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet';
export type ButtonSize = 'sm' | 'md';

/**
 * 2026-11 redesign: square-cornered, flat, one decision for every button in the product.
 * - primary: solid Line indigo. One per view - the action the page is for (usually a link into a
 *   tool, never a submit: results update live). Hover deepens the indigo a step; the soft tint is
 *   reserved for your time and your results, never for chrome.
 * - secondary: an ink outline on paper, for the rest (copy, download, share).
 * - quiet: text only, underlined; the underline thickens on hover.
 * Every button sinks slightly on press (scale .97) so a tap is felt. Renders an <a> when
 * `href` is given, so navigation stays a real link.
 */
const BASE =
  'inline-flex items-center justify-center gap-2 rounded-[6px] font-semibold whitespace-nowrap select-none transition-[background-color,color,border-color,transform] duration-150 ease-[var(--ease-out)] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 aria-disabled:cursor-not-allowed aria-disabled:opacity-50';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover',
  secondary: 'border border-ink bg-surface text-ink hover:bg-surface-alt',
  quiet: 'text-ink underline decoration-1 underline-offset-[0.22em] hover:decoration-2',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3.5 text-sm',
  md: 'h-11 px-5 text-[15px]',
};

export function buttonClasses(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra = ''): string {
  return `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${variant === 'quiet' ? (size === 'sm' ? 'px-2.5' : 'px-3') : ''} ${extra}`.replace(/\s+/g, ' ').trim();
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  className?: string;
}

type ButtonAsButton = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type ButtonAsLink = CommonProps & AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };

export function Button(props: ButtonAsButton | ButtonAsLink) {
  const { variant = 'primary', size = 'md', className = '', children, ...rest } = props;
  const cls = buttonClasses(variant, size, className);
  if (typeof rest.href === 'string') {
    return (
      <a {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)} className={cls}>
        {children}
      </a>
    );
  }
  const { type = 'button', ...buttonRest } = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type={type} {...buttonRest} className={cls}>
      {children}
    </button>
  );
}
