import Link from 'next/link';
import { PRODUCT_NAME } from '@/lib/brand';

/** Header for the public pages (landing, demo, agent docs). */
export function PublicHeader() {
  return (
    <header className="border-b border-line bg-surface">
      <nav aria-label="Main" className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 text-sm">
        <Link href="/" className="font-semibold text-ink">{PRODUCT_NAME}</Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <Link href="/demo" className="text-ink underline-offset-4 hover:underline">Demo</Link>
          <Link href="/docs/agents" className="text-ink underline-offset-4 hover:underline">For AI agents</Link>
          <Link href="/signin" className="text-ink underline-offset-4 hover:underline">Sign in</Link>
        </div>
      </nav>
    </header>
  );
}
