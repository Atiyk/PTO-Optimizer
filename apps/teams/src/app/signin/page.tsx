import Link from 'next/link';
import { PRODUCT_NAME } from '@/lib/brand';
import { devLoginEnabled } from '@/lib/session';
import { btnPrimary, btnSecondary } from '@/components/ui';

const ERRORS: Record<string, string> = {
  slack_not_configured: 'Sign in with Slack is not configured on this deployment yet.',
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
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-semibold text-ink">Sign in to {PRODUCT_NAME}</h1>
      <p className="mt-2 text-sm text-muted">Use the Slack account you use at work. New here? Sign in, then create your team’s workspace.</p>
      {error && (
        <p role="alert" className="mt-4 rounded-md border border-ink bg-band p-3 text-sm text-ink">
          {ERRORS[error] ?? 'Sign-in failed. Please try again.'}
        </p>
      )}
      <a href={`/api/auth/slack/start${nextQs}`} className={`${btnPrimary} mt-6 w-full`}>
        Sign in with Slack
      </a>
      {devLoginEnabled() && (
        <Link href="/dev/login" className={`${btnSecondary} mt-3 w-full`}>
          Dev login (local only)
        </Link>
      )}
    </main>
  );
}
