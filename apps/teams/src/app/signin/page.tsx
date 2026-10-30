import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { btnPrimary, btnSecondary } from '@/components/ui';
import { dbMode } from '@/db/client';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/brand';
import { devLoginEnabled } from '@/lib/session';

const ERRORS: Record<string, string> = {
  slack_not_configured: 'Sign in with Slack is not configured on this deployment yet.',
  demo_only: 'This deployment has no database yet, so it runs the demo only. Real workspaces open once one is connected.',
  state: 'The sign-in link expired. Please try again.',
  denied: 'Slack sign-in was cancelled.',
  token: 'Slack did not accept the sign-in. Please try again.',
  userinfo: 'Could not read your Slack profile. Please try again.',
  rate_limited: 'Too many sign-in attempts. Wait a minute and try again.',
};

export const dynamic = 'force-dynamic';

export default async function SignIn({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const nextQs = next?.startsWith('/') ? `?next=${encodeURIComponent(next)}` : '';
  const demoOnly = dbMode() === 'demo-only';
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <main className="flex flex-col px-4 py-10 sm:px-10">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Logo />
          {PRODUCT_NAME}
        </Link>
        <div className="mx-auto my-auto w-full max-w-sm py-12">
          <h1 className="text-3xl font-semibold tracking-tight text-ink">Sign in</h1>
          <p className="mt-2 text-muted">Use the Slack account you use at work. New here? Sign in, then create your team’s workspace in a minute.</p>
          {(error || demoOnly) && (
            <p role="alert" className="mt-6 rounded-md border border-ink bg-band p-3 text-sm text-ink">
              {ERRORS[error ?? 'demo_only'] ?? 'Sign-in failed. Please try again.'}
            </p>
          )}
          {!demoOnly && (
            <a href={`/api/auth/slack/start${nextQs}`} className={`${btnPrimary} mt-8 w-full py-2.5`}>
              Sign in with Slack
            </a>
          )}
          <p className="mt-6 text-sm text-muted">
            Work shifts? Your manager can give you a sign-in code for the{' '}
            <Link href="/m/signin" className="font-medium text-accent underline-offset-4 hover:underline">phone app</Link>.
          </p>
          <div className="mt-8 border-t border-line pt-6">
            <p className="text-sm text-muted">Just looking?</p>
            <Link href="/try" className={`${btnSecondary} mt-2 w-full py-2.5`}>Try the demo, no sign-up</Link>
            {devLoginEnabled() && (
              <Link href="/dev/login" className={`${btnSecondary} mt-3 w-full`}>
                Dev login (local only)
              </Link>
            )}
          </div>
        </div>
      </main>
      <aside className="on-hero hidden flex-col justify-center bg-hero px-12 text-on-hero lg:flex" aria-label="About">
        <p className="max-w-md text-3xl font-semibold tracking-tight text-balance">{PRODUCT_TAGLINE}</p>
        <ul className="mt-8 max-w-md space-y-3 text-on-hero-muted">
          <li>Balances and gaps from a tested engine, explained line by line.</li>
          <li>Staffing rules with their sources, for centres and clinics.</li>
          <li>Slack, a phone app, and an API for your AI agents.</li>
        </ul>
      </aside>
    </div>
  );
}
