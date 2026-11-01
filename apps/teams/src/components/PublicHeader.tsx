import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { btnPrimary } from '@/components/ui';
import { PRODUCT_NAME } from '@/lib/brand';

const LINKS: [href: string, text: string][] = [
  ['/#call-off', 'Product'],
  ['/#compliance', 'Compliance'],
  ['/#for-staff', 'For staff'],
];

/**
 * Header for the public pages (landing, demo, agent docs): three links, one call to action,
 * then sign-in. Developer links live in the footer. Solid background, no blur.
 */
export function PublicHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-page">
      <nav aria-label="Main" className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 text-sm">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold whitespace-nowrap text-ink">
          <Logo />
          <span>{PRODUCT_NAME}</span>
        </Link>
        <ul className="hidden items-center gap-7 md:flex">
          {LINKS.map(([href, text]) => (
            <li key={href}>
              <Link href={href} className="text-ink underline-offset-4 hover:underline">{text}</Link>
            </li>
          ))}
        </ul>
        <div className="flex items-center gap-4">
          <Link href="/try" className={`${btnPrimary} whitespace-nowrap`}>Try the demo</Link>
          <Link href="/signin" className="whitespace-nowrap text-ink underline-offset-4 hover:underline">Sign in</Link>
        </div>
      </nav>
    </header>
  );
}
