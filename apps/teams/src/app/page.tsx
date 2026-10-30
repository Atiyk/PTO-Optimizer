import Link from 'next/link';
import { PublicHeader } from '@/components/PublicHeader';
import { btnPrimary, btnSecondary } from '@/components/ui';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/brand';

const FEATURES: [title: string, body: string][] = [
  ['Exact numbers', 'Every balance and date comes from a deterministic engine. AI reads and writes words; it never makes up a number.'],
  ['Set up from your handbook', 'Paste your leave policy. Each value comes with the sentence it came from, and anything unclear comes back as a question.'],
  ['Clear expiring leave', 'Spread the days people would lose across the team, without anyone dropping below the cover you need.'],
  ['Requests in plain words', '"Next Friday and Monday off" becomes a request, with public holidays left out of the count.'],
  ['Slack, and your AI agents', 'Ask, approve and see who is out from Slack. Agents connect over MCP or REST with scoped keys, and you choose what they may do alone.'],
  ['Built to be checked', 'An audit log of every action, exports of everything, and one switch that stops all agent access.'],
];

const REGULATED: [title: string, body: string][] = [
  ['Rules with sources', 'Staff-to-child ratios, group sizes and required roles from your state, each with its regulation and section, or marked "needs verification".'],
  ['Gaps before they happen', 'Approved and requested leave, call-offs and expiring credentials, checked per room and half hour, up to 12 weeks ahead.'],
  ['Cover that is legal and fair', 'Ranked by who may legally take it, then by fairness, with the reason for every yes and no. The first eligible acceptance wins.'],
  ['A staff app, no Slack needed', 'Call in sick in two taps, with no reason asked. Take cover offers from a phone. Sign in with a passkey.'],
  ['Sick leave from hours worked', 'Accrual by state and city law from imported hours, with caps and carry-over explained line by line.'],
  ['Children stay anonymous', 'Only counts per age group, room and time block. No names, no birthdays, ever.'],
];

export default function Home() {
  return (
    <>
      <PublicHeader />
      <main className="mx-auto max-w-5xl px-4 py-14 sm:py-20">
        <p className="text-sm font-medium tracking-wide text-muted uppercase">Early preview</p>
        <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{PRODUCT_NAME}</h1>
        <p className="mt-4 max-w-xl text-lg text-muted">{PRODUCT_TAGLINE}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link href="/demo" className={btnPrimary}>Try the demo</Link>
          <Link href="/signin" className={btnSecondary}>Sign in with Slack</Link>
        </div>
        <p className="mt-3 text-sm text-muted">The demo runs on a made-up 25-person company. No sign-up needed.</p>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([title, body]) => (
            <li key={title} className="rounded-lg border border-line bg-surface p-4">
              <h2 className="font-medium text-ink">{title}</h2>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ul>

        <section className="mt-14 rounded-lg border border-line bg-surface p-5" aria-labelledby="regulated">
          <p className="text-sm font-medium tracking-wide text-muted uppercase">For childcare centres and clinics</p>
          <h2 id="regulated" className="mt-1 text-xl font-semibold text-ink">Know before an absence breaks a staffing rule</h2>
          <p className="mt-2 max-w-2xl text-muted">
            Where coverage is the law, a day off can leave a room out of ratio. See it per room and half hour, with the rule and its source,
            and find cover that is legal, qualified and fair.
          </p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {REGULATED.map(([title, body]) => (
              <li key={title} className="rounded-md border border-line bg-page p-3">
                <h3 className="font-medium text-ink">{title}</h3>
                <p className="mt-1 text-sm text-muted">{body}</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link href="/demo/coverage" className={btnPrimary}>Try the coverage demo</Link>
            <span className="text-sm text-muted">A made-up 18-person centre. Not legal advice: every rule shows its source or &ldquo;needs verification&rdquo;.</span>
          </div>
        </section>

        <p className="mt-12 max-w-2xl text-sm text-muted">
          Made by the people behind Days Off, the free planner that finds the best dates for your own time off. This is an early
          preview, and there is no pricing yet.
        </p>
      </main>
    </>
  );
}
