import Link from 'next/link';
import type { ReactNode } from 'react';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { btn, btnPrimary, btnSecondary } from '@/components/ui';
import { PRODUCT_TAGLINE } from '@/lib/brand';

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

const INDUSTRIES = ['Offices', 'Childcare', 'Clinics', 'Healthcare and care homes', 'Retail', 'Restaurants and hospitality', 'Security and facilities', 'Manufacturing and warehouses'];

const INTEGRATIONS: [title: string, body: string, icon: ReactNode][] = [
  ['Slack', 'Request, approve and see who is out without leaving Slack. Sign in with your work account.', <IconChat key="i" />],
  ['Phone app', 'Installs from the browser, signs in with a passkey, and works for staff who never use Slack.', <IconPhone key="i" />],
  ['AI agents over MCP', 'Claude and other agents read and draft through the same rules as people, with scoped keys you control.', <IconSpark key="i" />],
  ['REST API and webhooks', 'Every action the app can take, as an API, plus signed events when leave or cover changes.', <IconCode key="i" />],
  ['Spreadsheet import', 'Bring people, balances and hours worked from a CSV. Each row is checked before anything is saved.', <IconTable key="i" />],
];

const TRUST: [title: string, body: string][] = [
  ['Exact numbers', 'Balances, ratios and gaps come from a tested engine. AI only reads and writes words.'],
  ['An audit log of everything', 'Every action, by a person or an agent, with who did it and when.'],
  ['Your data, exportable', 'Export everything at any time. Delete a person or the whole workspace in one step.'],
  ['One switch for agents', 'Turn off all agent access at once, and choose what agents may do without asking.'],
];

export default function Home() {
  return (
    <>
      <PublicHeader />
      <main>
        <section className="on-hero bg-hero text-on-hero" aria-labelledby="hero">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 pt-16 pb-20 lg:grid-cols-[1fr_minmax(0,32rem)] lg:items-center lg:pt-24 lg:pb-28">
            <div>
              <p className="inline-flex rounded-full border border-on-hero-muted/40 px-3 py-1 text-xs font-medium tracking-wide text-on-hero-muted uppercase">
                Early preview · free to try
              </p>
              <h1 id="hero" className="mt-5 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Know who’s off, who’s on the clock, and who can cover.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-on-hero-muted">{PRODUCT_TAGLINE} One system for any team that works in shifts, with presets for regulated industries where one absence can break a rule.</p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/try" className={`${btn} bg-on-hero px-5 py-2.5 text-base text-accent-strong hover:bg-accent-soft`}>Try the demo</Link>
                <Link href="/signin" className={`${btn} border border-on-hero-muted/60 px-5 py-2.5 text-base text-on-hero hover:bg-white/10`}>Sign in</Link>
              </div>
              <p className="mt-4 text-sm text-on-hero-muted">No sign-up. You get your own copy of a made-up team.</p>
            </div>
            <HeroVisual />
          </div>
        </section>

        <section id="product" className="scroll-mt-20" aria-labelledby="product-h">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SectionHead id="product-h" eyebrow="One app, two sides" title="Built for the people who approve, and the people who ask">
              Managers get the context to say yes quickly. Everyone else gets a balance they can trust and a request that takes seconds.
            </SectionHead>
            <div className="mt-12 grid gap-8 lg:grid-cols-2">
              <Side title="For managers and owners" items={MANAGERS} visual={<ApprovalVisual />} />
              <Side title="For your team" items={STAFF} visual={<BalanceVisual />} />
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
            <div className="mt-8">
              <h3 className="text-sm font-semibold text-ink">One system, presets for your industry</h3>
              <ul className="mt-3 flex flex-wrap gap-2" aria-label="Industry presets">
                {INDUSTRIES.map((i) => (
                  <li key={i} className="rounded-full border border-line bg-page px-3 py-1 text-sm text-ink">{i}</li>
                ))}
              </ul>
            </div>
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
    </>
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

function Side({ title, items, visual }: { title: string; items: [string, string][]; visual: ReactNode }) {
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-surface p-6 sm:p-8">
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

/** The hero: the manager's coverage view in a window, with the staff phone app beside it. */
function HeroVisual() {
  return (
    <div className="relative pb-16 sm:pr-36 lg:pr-28">
      <div className="overflow-hidden rounded-2xl border border-white/15 bg-surface shadow-2xl">
        <div className="flex items-center gap-1.5 border-b border-line bg-page px-4 py-2.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-line" />
          <span className="h-2.5 w-2.5 rounded-full bg-line" />
          <span className="h-2.5 w-2.5 rounded-full bg-line" />
          <span className="ml-3 text-xs text-muted">Coverage · Sunbeam Early Learning</span>
        </div>
        <div className="space-y-3 p-4 text-ink">
          <div className="rounded-lg border-l-8 border-gap-line bg-gap-bg p-3">
            <p className="font-semibold text-gap-text">1 gap this week</p>
            <p className="text-sm">Monday 15:30, Toddlers, 1 staff short</p>
          </div>
          <SampleGrid compact />
        </div>
      </div>
      <figure className="absolute right-0 bottom-0 hidden w-44 rounded-[1.75rem] border-4 border-ink bg-page p-3 text-ink shadow-2xl sm:block" aria-label="Example: the staff phone app">
        <div className="mx-auto mb-2 h-1.5 w-12 rounded-full bg-line" aria-hidden="true" />
        <p className="text-[11px] font-medium text-muted uppercase">Tomorrow</p>
        <p className="text-sm font-semibold">7:00 – 15:00</p>
        <p className="text-xs text-muted">Toddlers</p>
        <span className="mt-3 block rounded-lg border-2 border-gap-line bg-gap-bg py-2 text-center text-xs font-semibold text-gap-text" aria-hidden="true">
          I can’t come in
        </span>
        <span className="mt-2 block rounded-lg bg-accent py-2 text-center text-xs font-semibold text-white" aria-hidden="true">
          1 cover offer
        </span>
        <figcaption className="sr-only">Tomorrow 7:00 to 15:00 in Toddlers, with an “I can’t come in” button and one cover offer.</figcaption>
      </figure>
    </div>
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
function IconSpark() {
  return <svg {...iconProps}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" /></svg>;
}
function IconCode() {
  return <svg {...iconProps}><path d="M8 7l-5 5 5 5M16 7l5 5-5 5" /></svg>;
}
function IconTable() {
  return <svg {...iconProps}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></svg>;
}
