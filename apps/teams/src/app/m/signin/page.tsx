import { SignIn } from '@/components/mobile/Passkeys';
import { PRODUCT_NAME } from '@/lib/brand';

/** Staff sign-in: a passkey, or a one-time code from a manager. No email, no SMS. */
export default function StaffSignIn() {
  return (
    <main className="mx-auto max-w-md space-y-6 px-4 py-10">
      <div>
        <div className="text-sm text-muted">{PRODUCT_NAME}</div>
        <h1 className="text-2xl font-semibold text-ink">Sign in</h1>
        <p className="mt-1 text-sm text-ink">First time? Ask your manager for a sign-in code. Then add a passkey so next time is one tap.</p>
      </div>
      <SignIn />
      <p className="text-sm text-muted">
        Managers and admins: <a href="/signin" className="underline">sign in here</a>.
      </p>
    </main>
  );
}
