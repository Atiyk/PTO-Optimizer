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

/** An illustration of the coverage heatmap (fixed example values, labelled as such), not live data. */
const SAMPLE: [room: string, cells: (number | null)[]][] = [
  ['Infants', [0, 0, 0, 0, 0, 0, 0, 0]],
  ['Toddlers', [0, 0, 0, 0, 0, 1, 1, 0]],
  ['Preschool', [0, 0, 0, 0, 0, 0, 0, 0]],
];
const SAMPLE_TIMES = ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'];

function SampleGrid() {
  return (
    <figure className="rounded-xl border border-line bg-page p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Monday, by room</p>
        <span className="rounded border border-line bg-surface-alt px-1.5 py-0.5 text-xs text-muted">Example</span>
      </div>
      <table className="mt-3 w-full table-fixed border-separate border-spacing-0.5 text-center text-[11px] tabular-nums">
        <colgroup>
          <col className="w-20" />
          {SAMPLE_TIMES.map((t) => (
            <col key={t} />
          ))}
        </colgroup>
        <caption className="sr-only">Example: Toddlers is one staff member short from 15:30 to 16:30; every other room is in ratio.</caption>
        <thead>
          <tr>
            <th scope="col" className="pr-2 text-left font-medium text-muted">Room</th>
            {SAMPLE_TIMES.map((t) => (
              <th key={t} scope="col" className="text-left font-medium text-muted">{t.endsWith(':00') ? t.slice(0, 2) : ''}<span className="sr-only">{t}</span></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SAMPLE.map(([room, cells]) => (
            <tr key={room}>
              <th scope="row" className="pr-2 text-left font-medium text-ink">{room}</th>
              {cells.map((n, i) =>
                n ? (
                  <td
                    key={i}
                    className="h-7 rounded-sm border-2 border-gap-line bg-gap-fill font-semibold text-gap-text"
                    style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent 0 4px, rgba(185,28,28,.28) 4px 6px)' }}
                  >
                    −{n}
                  </td>
                ) : (
                  <td key={i} className="h-7 rounded-sm border border-ok-line bg-ok-fill" />
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <figcaption className="mt-3 rounded-md border-l-4 border-gap-line bg-gap-bg p-2 text-sm">
        <span className="font-semibold text-gap-text">Toddlers, 15:30–16:30: 1 staff short</span>
        <span className="block text-muted">1 teacher per 6 children · Cal. Health &amp; Safety Code § 1596.955</span>
        <span className="mt-1 block text-ink">3 people can legally cover it. Ask the top 3 →</span>
      </figcaption>
    </figure>
  );
}

export default function Home() {
  return (
    <>
      <PublicHeader />
      <main>
      <div className="mx-auto max-w-5xl px-4 pt-14 pb-12 sm:pt-20">
        <p className="text-sm font-medium tracking-wide text-muted uppercase">Early preview</p>
        <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-ink sm:text-4xl">{PRODUCT_NAME}</h1>
        <p className="mt-4 max-w-xl text-lg text-muted">{PRODUCT_TAGLINE}</p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link href="/demo" className={btnPrimary}>Try the demo</Link>
          <Link href="/demo/coverage" className={btnSecondary}>Coverage demo</Link>
          <Link href="/signin" className={btnSecondary}>Sign in with Slack</Link>
        </div>
        <p className="mt-3 text-sm text-muted">The demo runs on a made-up 25-person company. No sign-up needed.</p>

      </div>

      <section className="border-y border-line bg-surface" aria-labelledby="regulated">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-14 lg:grid-cols-[1fr_minmax(0,26rem)] lg:items-center">
          <div>
            <p className="text-sm font-medium tracking-wide text-muted uppercase">For childcare centres and clinics</p>
            <h2 id="regulated" className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Know before an absence breaks a staffing rule</h2>
            <p className="mt-3 max-w-xl text-lg text-muted">
              Where coverage is the law, one day off can leave a room out of ratio. See it per room and half hour, with the rule and its source,
              and find cover that is legal, qualified and fair.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link href="/demo/coverage" className={btnPrimary}>Try the coverage demo</Link>
              <span className="text-sm text-muted">A made-up 18-person centre. Not legal advice.</span>
            </div>
          </div>
          <SampleGrid />
        </div>
        <ul className="mx-auto grid max-w-5xl gap-3 px-4 pb-14 sm:grid-cols-2 lg:grid-cols-3">
          {REGULATED.map(([title, body]) => (
            <li key={title} className="rounded-lg border border-line bg-page p-4">
              <h3 className="font-medium text-ink">{title}</h3>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-14">
        <h2 className="text-xl font-semibold text-ink">For every team: leave you can trust</h2>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(([title, body]) => (
            <li key={title} className="rounded-lg border border-line bg-surface p-4">
              <h3 className="font-medium text-ink">{title}</h3>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ul>

        <p className="mt-12 max-w-2xl text-sm text-muted">
          Made by the people behind Days Off, the free planner that finds the best dates for your own time off. This is an early
          preview, and there is no pricing yet.
        </p>
      </div>
      </main>
    </>
  );
}
