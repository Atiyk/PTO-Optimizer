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

        <p className="mt-12 max-w-2xl text-sm text-muted">
          Made by the people behind Days Off, the free planner that finds the best dates for your own time off. This is an early
          preview, and there is no pricing yet.
        </p>
      </main>
    </>
  );
}
