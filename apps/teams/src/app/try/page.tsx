import type { Metadata } from 'next';
import Link from 'next/link';
import { PendingButton } from '@/components/PendingButton';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { btnPrimary, btnSecondary } from '@/components/ui';
import { PRODUCT_NAME } from '@/lib/brand';
import { startDemo } from './actions';

export const metadata: Metadata = { title: `Try the demo · ${PRODUCT_NAME}`, description: 'Your own copy of a made-up childcare centre or office. No sign-up.' };
export const dynamic = 'force-dynamic';

const CHOICES: { kind: 'centre' | 'company'; view: 'manager' | 'staff'; eyebrow: string; title: string; body: string; points: string[]; cta: string; primary?: boolean }[] = [
  {
    kind: 'centre',
    view: 'manager',
    eyebrow: 'Childcare centre · director',
    title: 'Run Sunbeam Early Learning',
    body: '18 staff across Infants, Toddlers and Preschool in California. One teacher is off on Monday.',
    points: ['Spot the room that falls out of ratio', 'See the rule and its source', 'Find legal, fair cover and send offers'],
    cta: 'Open as the director',
    primary: true,
  },
  {
    kind: 'centre',
    view: 'staff',
    eyebrow: 'Childcare centre · teacher',
    title: 'Work a shift on your phone',
    body: 'Ava teaches in Toddlers. Best on a phone, and works on a laptop too.',
    points: ['See your next shifts', 'Call in sick in two taps', 'Accept or decline cover offers'],
    cta: 'Open the staff app',
  },
  {
    kind: 'company',
    view: 'manager',
    eyebrow: 'Office · owner',
    title: 'Plan leave at Northwind Labs',
    body: '25 people in San Francisco and London, on two teams, with leave about to expire.',
    points: ['Approve requests with the full picture', 'Spread expiring leave without losing cover', 'Read a handbook into a policy'],
    cta: 'Open as the owner',
  },
];

export default async function TryDemo({ searchParams }: { searchParams: Promise<{ busy?: string }> }) {
  const { busy } = await searchParams;
  return (
    <>
      <PublicHeader />
      <main className="bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:py-20">
          <p className="text-sm font-semibold tracking-wide text-accent uppercase">Try the demo</p>
          <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">Pick a made-up team and look around</h1>
          <p className="mt-4 max-w-2xl text-lg text-muted">
            You get your own private copy, signed in, with no sign-up. Change anything you like. Nothing in it reaches a real person, and it is deleted after a day.
          </p>
          {busy && (
            <p role="alert" className="mt-6 max-w-2xl rounded-md border border-ink bg-band p-3 text-sm text-ink">
              A lot of people are trying the demo right now. Please try again in a few minutes, or take a walkthrough below.
            </p>
          )}
          <ul className="mt-10 grid gap-6 lg:grid-cols-3">
            {CHOICES.map((c) => (
              <li key={`${c.kind}-${c.view}`} className={`flex flex-col rounded-2xl border bg-page p-6 ${c.primary ? 'border-accent shadow-md' : 'border-line'}`}>
                <p className="text-xs font-semibold tracking-wide text-muted uppercase">{c.eyebrow}</p>
                <h2 className="mt-2 text-xl font-semibold text-ink">{c.title}</h2>
                <p className="mt-2 text-sm text-muted">{c.body}</p>
                <ul className="mt-4 flex-1 space-y-2 text-sm text-ink">
                  {c.points.map((p) => (
                    <li key={p} className="flex gap-2">
                      <span aria-hidden="true" className="text-accent">✓</span>
                      {p}
                    </li>
                  ))}
                </ul>
                <form action={startDemo} className="mt-6">
                  <input type="hidden" name="kind" value={c.kind} />
                  <input type="hidden" name="view" value={c.view} />
                  <PendingButton className={`${c.primary ? btnPrimary : btnSecondary} w-full py-2.5`} pending="Setting up your copy…">
                    {c.cta}
                  </PendingButton>
                </form>
              </li>
            ))}
          </ul>
          <div className="mt-12 rounded-2xl border border-line bg-page p-6">
            <h2 className="font-semibold text-ink">Rather watch first?</h2>
            <p className="mt-1 text-sm text-muted">Two short walkthroughs on shared samples, nothing to set up.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href="/demo/coverage" className={btnSecondary}>A call-off, step by step</Link>
              <Link href="/demo" className={btnSecondary}>Leave planning for 25 people</Link>
            </div>
          </div>
          <p className="mt-8 text-sm text-muted">Every person and child count in the samples is made up. Staffing rules show their sources and are not legal advice.</p>
        </div>
      </main>
      <PublicFooter />
    </>
  );
}
