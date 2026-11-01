import { Source_Serif_4 } from 'next/font/google';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { btn, btnPrimary, btnSecondary } from '@/components/ui';
import { HeroCoverageGrid } from '@/components/marketing/HeroCoverageGrid';
import { buildHeroExample } from '@/components/marketing/heroExample';

/*
 * The marketing page. Every picture on it is the product's own UI pattern drawn with fixed,
 * made-up example values (each labelled "Example"), never a stock photo or a screenshot of
 * real data. No prices and no customer claims: there are none yet.
 */

const MANAGERS: [title: string, body: string][] = [
  ['Approve with the full picture', 'Each request shows the balance after it, who else is out, and whether cover still holds. One tap in the app or in Slack.'],
  ['Clear leave before it expires', 'The planner spreads the days people would lose across the year without anyone dropping below the cover you need.'],
  ['Set up from your handbook', 'Paste your leave policy. Each value comes back with the sentence it came from, and anything unclear comes back as a question.'],
];

const STAFF: [title: string, body: string][] = [
  ['A balance you can check', 'Every number comes from a deterministic engine, with a line-by-line "why this number". AI never makes one up.'],
  ['Ask in your own words', '"Next Friday and Monday off" becomes a request, with public holidays left out of the count.'],
  ['Call in sick in two taps', 'From the phone app, with no reason asked. Cover offers arrive there too, with Accept and Decline.'],
];

const REGULATED: [title: string, body: string][] = [
  ['Rules with sources', 'Staff-to-child ratios, group sizes and required roles for your state, each with its regulation and section, or marked "needs verification".'],
  ['Gaps before they happen', 'Approved and requested leave, call-offs and expiring credentials, checked per room and half hour, up to 12 weeks ahead.'],
  ['Cover that is legal and fair', 'Ranked by who may legally take the shift, then by fairness, with the reason for every yes and no.'],
  ['Children stay anonymous', 'Only counts per age group, room and time block. No names, no birthdays, ever.'],
];

const TIME: [title: string, body: string][] = [
  ['Clock in from a phone', 'One big button, a meal-break reminder with its deadline, and a yes/no on rest breaks at clock-out. People only: agents can’t punch.'],
  ['Hours that sync themselves', 'Every clock-out updates the timesheet and hourly sick-leave accrual. No CSV to import, no end-of-week chasing.'],
  ['Overtime you see coming', 'Daily, weekly, double time and 7th-day rules per state. Cover goes to people at regular time first, unless you say otherwise.'],
  ['A compliance inbox, not a binder', 'Missed clock-outs, short or late meals, overtime, timesheets to approve and expiring credentials, each with a link to fix it.'],
];

const INTEGRATIONS: [title: string, body: string, icon: ReactNode][] = [
  ['Slack', 'Request, approve and see who is out without leaving Slack. Sign in with your work account.', <IconChat key="i" />],
  ['Phone app', 'Installs from the browser, signs in with a passkey, and works for staff who never use Slack.', <IconPhone key="i" />],
  ['AI agents over MCP', 'Claude and other agents read and draft through the same rules as people, with scoped keys you control.', <IconPlug key="i" />],
  ['REST API and webhooks', 'Every action the app can take, as an API, plus signed events when leave or cover changes.', <IconCode key="i" />],
  ['Spreadsheet import', 'Bring people, balances and hours worked from a CSV. Each row is checked before anything is saved.', <IconTable key="i" />],
];

const TRUST: [title: string, body: string][] = [
  ['Exact numbers', 'Balances, ratios and gaps come from a tested engine. AI only reads and writes words.'],
  ['An audit log of everything', 'Every action, by a person or an agent, with who did it and when.'],
  ['Your data, exportable', 'Export everything at any time. Delete a person or the whole workspace in one step.'],
  ['One switch for agents', 'Turn off all agent access at once, and choose what agents may do without asking.'],
];

/** Serif for marketing headings only; loaded (and preloaded) by this page alone. */
const serif = Source_Serif_4({ subsets: ['latin'], weight: ['600'], display: 'swap', variable: '--font-display' });

export default function Home() {
  return (
    <div className={serif.variable}>
      <PublicHeader />
      <main>
        <section className="bg-page" aria-labelledby="hero">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 pt-12 pb-20 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,44rem)] lg:items-start lg:gap-12 lg:pt-20 lg:pb-24">
            <div className="lg:pt-8">
              <p className="text-sm font-semibold text-accent">For childcare centres, clinics and care homes</p>
              <h1 id="hero" className="mt-4 font-serif text-[2.5rem] leading-[1.1] font-semibold tracking-tight text-balance text-ink sm:text-5xl lg:text-[3.5rem]">
                Know before an absence breaks a staffing rule.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted">
                See each room against its staffing rule and, when someone calls in sick, the gap, the rule behind it and who can cover.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/try" className={`${btnPrimary} px-5 py-2.5 text-base`}>Try the demo</Link>
                <Link href="#coverage" className={`${btnSecondary} px-5 py-2.5 text-base`}>See how call-offs work</Link>
              </div>
              <p className="mt-8 flex max-w-xl gap-2 text-base text-ink">
                <Check />
                <span>
                  <strong className="font-semibold">AI that shows its work:</strong> every number comes from a tested engine, every rule links to its source.
                </span>
              </p>
              <p className="mt-3 text-sm text-muted">Early preview · free to try. No sign-up: you get your own copy of a made-up team.</p>
            </div>
            <HeroCoverageGrid data={buildHeroExample()} />
          </div>
        </section>

        <section id="product" className="scroll-mt-20" aria-labelledby="product-h">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SectionHead id="product-h" eyebrow="One app, two sides" title="Built for the people who approve, and the people who ask">
              Managers get the context to say yes quickly. Everyone else gets a balance they can trust and a request that takes seconds.
            </SectionHead>
            <div className="mt-12 grid gap-8 lg:grid-cols-2">
              <Side title="For managers and owners" items={MANAGERS} visual={<ApprovalVisual />} />
              <Side id="for-staff" title="For your team" items={STAFF} visual={<BalanceVisual />} />
            </div>
          </div>
        </section>

        <section id="time" className="scroll-mt-20 border-t border-line" aria-labelledby="time-h">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SectionHead id="time-h" eyebrow="Time and compliance" title="The admin work that grows with every hire, done for you">
              Clock-ins become timesheets, timesheets become overtime and break checks against your state’s rules, and anything that needs a person lands in one inbox.
            </SectionHead>
            <ul className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {TIME.map(([title, body]) => (
                <li key={title} className="border-l-2 border-accent pl-4">
                  <h3 className="font-semibold text-ink">{title}</h3>
                  <p className="mt-1 text-sm text-muted">{body}</p>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-sm text-muted">
              Overtime and break rules for US federal, California, Washington, Colorado, New York State and New York City, each cited and dated. Configurable defaults, not legal advice. Hours only: pay stays with your payroll provider.
            </p>
          </div>
        </section>

        <section id="coverage" className="scroll-mt-20 border-y border-line bg-surface" aria-labelledby="coverage-h">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 lg:grid-cols-[1fr_minmax(0,28rem)] lg:items-center">
            <div>
              <SectionHead id="coverage-h" eyebrow="For regulated industries" title="Know before an absence breaks a staffing rule">
                Where coverage is the law, one day off can leave a room out of ratio. See it per room and half hour, with the rule and its source, and find
                cover that is legal, qualified and fair.
              </SectionHead>
              <ul className="mt-8 grid gap-5 sm:grid-cols-2">
                {REGULATED.map(([title, body]) => (
                  <li key={title}>
                    <h3 className="flex items-center gap-2 font-semibold text-ink">
                      <Check />
                      {title}
                    </h3>
                    <p className="mt-1 text-sm text-muted">{body}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/try" className={btnPrimary}>Open the sample centre</Link>
                <Link href="/demo/coverage" className={btnSecondary}>Watch a call-off, step by step</Link>
              </div>
              <p className="mt-3 text-sm text-muted">California, Texas and New York childcare packs and a clinic template included. Not legal advice.</p>
            </div>
            <SampleGrid />
          </div>
        </section>

        <section id="integrations" className="scroll-mt-20" aria-labelledby="integrations-h">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SectionHead id="integrations-h" eyebrow="Works where your team already is" title="Slack, a phone app, and an API for your AI agents">
              No new habit to build. People ask from Slack or their phone; your agents use the same rules through MCP or REST.
            </SectionHead>
            <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {INTEGRATIONS.map(([title, body, icon]) => (
                <li key={title} className="rounded-xl border border-line bg-page p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-accent-soft text-accent">{icon}</span>
                  <h3 className="mt-4 font-semibold text-ink">{title}</h3>
                  <p className="mt-1 text-sm text-muted">{body}</p>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-sm">
              <Link href="/docs/agents" className="font-medium text-accent underline-offset-4 hover:underline">Read the agent and API docs →</Link>
            </p>
          </div>
        </section>

        <section className="border-t border-line bg-surface" aria-labelledby="trust-h">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SectionHead id="trust-h" eyebrow="Built to be checked" title="Numbers you can show an auditor">
              Leave and staffing are where small mistakes cost the most. Everything here is designed to be explained and traced.
            </SectionHead>
            <ul className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {TRUST.map(([title, body]) => (
                <li key={title} className="border-l-2 border-accent pl-4">
                  <h3 className="font-semibold text-ink">{title}</h3>
                  <p className="mt-1 text-sm text-muted">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="on-hero bg-hero text-on-hero" aria-labelledby="cta-h">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 id="cta-h" className="text-2xl font-semibold tracking-tight sm:text-3xl">See it with a made-up team</h2>
              <p className="mt-2 max-w-xl text-on-hero-muted">Your own private copy of a sample centre or office, deleted after a day. Nothing you do there reaches a real person.</p>
            </div>
            <Link href="/try" className={`${btn} shrink-0 bg-on-hero px-5 py-2.5 text-base text-accent-strong hover:bg-accent-soft`}>Try the demo</Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

function SectionHead({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <div className="max-w-2xl">
      <p className="text-sm font-semibold tracking-wide text-accent uppercase">{eyebrow}</p>
      <h2 id={id} className="mt-2 text-3xl font-semibold tracking-tight text-balance text-ink sm:text-4xl">{title}</h2>
      <p className="mt-4 text-lg text-muted">{children}</p>
    </div>
  );
}

function Side({ id, title, items, visual }: { id?: string; title: string; items: [string, string][]; visual: ReactNode }) {
  return (
    <div id={id} className="flex scroll-mt-20 flex-col rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <h3 className="text-xl font-semibold text-ink">{title}</h3>
      <div className="mt-6">{visual}</div>
      <ul className="mt-8 space-y-5">
        {items.map(([t, b]) => (
          <li key={t} className="flex gap-3">
            <Check />
            <div>
              <h4 className="font-semibold text-ink">{t}</h4>
              <p className="mt-0.5 text-sm text-muted">{b}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Example() {
  return <span className="rounded border border-line bg-surface-alt px-1.5 py-0.5 text-xs text-muted">Example</span>;
}

/** The manager's approval card, drawn with fixed example values. */
function ApprovalVisual() {
  return (
    <figure className="rounded-xl border border-line bg-page p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Waiting for you</p>
        <Example />
      </div>
      <div className="mt-3 rounded-lg border border-line p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <p className="font-medium text-ink">Sam Rivera · Vacation</p>
          <p className="text-sm text-muted">Mon 7 – Fri 11 Dec · 5 days</p>
        </div>
        <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <Fact k="Left after" v="9 days" />
          <Fact k="Also out" v="1 of 6" />
          <Fact k="Cover" v="Holds" ok />
        </dl>
        <div className="mt-3 flex gap-2" aria-hidden="true">
          <span className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white">Approve</span>
          <span className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink">Decline</span>
        </div>
      </div>
      <figcaption className="sr-only">Example approval: Sam Rivera asks for 5 days of vacation; 9 days left after, 1 of 6 teammates also out, cover holds.</figcaption>
    </figure>
  );
}

function Fact({ k, v, ok }: { k: string; v: string; ok?: boolean }) {
  return (
    <div className={`rounded-md px-2 py-1.5 ${ok ? 'bg-ok-bg' : 'bg-surface-alt'}`}>
      <dt className="text-muted">{k}</dt>
      <dd className={`font-semibold ${ok ? 'text-ok-text' : 'text-ink'}`}>{v}</dd>
    </div>
  );
}

/** The employee's balance card and plain-words request, drawn with fixed example values. */
function BalanceVisual() {
  return (
    <figure className="rounded-xl border border-line bg-page p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Vacation</p>
        <Example />
      </div>
      <p className="mt-2 text-3xl font-semibold text-ink tabular-nums">14.5 days</p>
      <p className="text-sm text-muted">available now · 3 would expire on 31 Dec</p>
      <div className="mt-3 rounded-lg border border-line bg-surface p-3 text-sm">
        <p className="text-muted">“next Friday and Monday off”</p>
        <p className="mt-1 font-medium text-ink">Fri 13 – Mon 16 Nov · 2 days, weekend not counted</p>
      </div>
      <figcaption className="sr-only">Example: 14.5 vacation days available; the words “next Friday and Monday off” become a 2-day request.</figcaption>
    </figure>
  );
}

/** An illustration of the coverage heatmap (fixed example values, labelled as such), not live data. */
const SAMPLE: [room: string, cells: (number | null)[]][] = [
  ['Infants', [0, 0, 0, 0, 0, 0, 0, 0]],
  ['Toddlers', [0, 0, 0, 0, 0, 1, 1, 0]],
  ['Preschool', [0, 0, 0, 0, 0, 0, 0, 0]],
];
const SAMPLE_TIMES = ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'];

function SampleGrid({ compact = false }: { compact?: boolean }) {
  return (
    <figure className={`rounded-xl border border-line bg-page shadow-sm ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">Monday, by room</p>
        <Example />
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
        {!compact && <span className="mt-1 block text-ink">3 people can legally cover it. Ask the top 3 →</span>}
      </figcaption>
    </figure>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 20 20" className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="9" fill="var(--accent-soft)" />
      <path d="M6 10.5l2.5 2.5L14 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const iconProps = { viewBox: '0 0 24 24', className: 'h-5 w-5', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const;
function IconChat() {
  return <svg {...iconProps}><path d="M4 5h16v11H9l-5 4z" /></svg>;
}
function IconPhone() {
  return <svg {...iconProps}><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18h2" /></svg>;
}
function IconPlug() {
  return <svg {...iconProps}><path d="M9 3v5M15 3v5M6.5 8h11v3a5.5 5.5 0 0 1-11 0zM12 16.5V21" /></svg>;
}
function IconCode() {
  return <svg {...iconProps}><path d="M8 7l-5 5 5 5M16 7l5 5-5 5" /></svg>;
}
function IconTable() {
  return <svg {...iconProps}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></svg>;
}
