import Link from 'next/link';
import type { ReactNode } from 'react';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { SourceChip } from '@/components/SourceChip';
import { btnPrimary, btnSecondary } from '@/components/ui';
import { CallOffSteps } from '@/components/marketing/CallOffSteps';
import { HeroCoverageGrid } from '@/components/marketing/HeroCoverageGrid';
import { serif } from '@/components/marketing/fonts';
import { buildCallOffSteps, buildHeroExample, EXAMPLE } from '@/components/marketing/heroExample';
import { Check, Example, PhoneFrame, SectionHead } from '@/components/marketing/parts';
import { childcarePacks } from '@/components/marketing/rulesExample';
import { INDUSTRIES } from '@/domain/industries';

/*
 * The marketing page. Every picture on it is the product's own UI pattern drawn with fixed,
 * made-up example values (each labelled "Example"), never a stock photo or a screenshot of
 * real data. Counts, rules and rankings come from the engine (heroExample.ts, rulesExample.ts).
 * No prices and no customer claims: there are none yet.
 */

const LEAVE_TIME: [title: string, body: string][] = [
  ['Leave requests and approvals', 'Each request shows the balance after it, who else is out and whether cover still holds. Approve in the app, Slack or Teams.'],
  ['Leave that doesn’t expire unused', 'The planner spreads days people would lose across the year without dropping below the cover you need.'],
  ['Clock in from a phone', 'Every clock-out updates the timesheet and hourly sick-leave accrual, with meal and rest reminders.'],
  ['Overtime and breaks by state', 'Federal, California, Washington, Colorado, New York State and New York City rules, each cited. Hours only: payroll stays with your provider.'],
];

const TRUST: [title: string, body: string][] = [
  ['A tested engine for every number', 'Ratios, gaps, balances and rankings come from deterministic code with tests per rule. AI only reads and writes words.'],
  ['AI you can switch off', 'One setting turns off every AI feature for your workspace; forms keep working. A separate switch stops all agent access.'],
  ['An audit log of everything', 'Every change, by a person or an agent, with who, when and what. Turning AI off is recorded too.'],
  ['Your data, exportable', 'Export everything as CSV or JSON at any time. Delete a person or the whole workspace in one step.'],
];

export default function Home() {
  const hero = buildHeroExample();
  const steps = buildCallOffSteps();
  const packs = childcarePacks();
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
                <Link href="#call-off" className={`${btnSecondary} px-5 py-2.5 text-base`}>See how call-offs work</Link>
              </div>
              <p className="mt-8 flex max-w-xl gap-2 text-base text-ink">
                <Check />
                <span>
                  <strong className="font-semibold">AI that shows its work:</strong> every number comes from a tested engine, every rule links to its source.
                </span>
              </p>
              <p className="mt-3 text-sm text-muted">Early preview · free to try. No sign-up: you get your own copy of a made-up team.</p>
            </div>
            <HeroCoverageGrid data={hero} />
          </div>
        </section>

        {/* 2. Call-off, step by step */}
        <section id="call-off" className="scroll-mt-20 border-t border-line bg-surface" aria-labelledby="call-off-h">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SectionHead id="call-off-h" eyebrow="Call-offs" title="From a sick call to a covered room">
              The same example centre, one step at a time: the call, the gap and its rule, the offers, the accepted cover.
            </SectionHead>
            <div className="mt-12">
              <CallOffSteps data={steps} />
            </div>
            <p className="mt-8 text-sm">
              <Link href="/demo/coverage" className="font-medium text-accent underline underline-offset-4">Watch it run on the sample centre →</Link>
            </p>
          </div>
        </section>

        {/* 3. Compliance */}
        <section id="compliance" className="scroll-mt-20 border-t border-line" aria-labelledby="compliance-h">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SectionHead id="compliance-h" eyebrow="Compliance" title="Every rule shows where it comes from">
              Childcare ratios for three states, read from the regulation and dated. Select a source to see the text it came from.
            </SectionHead>
            <ul className="mt-12 grid gap-6 lg:grid-cols-3">
              {packs.map((p) => (
                <li key={p.state} className="rounded-2xl border border-line bg-card p-5">
                  <h3 className="text-lg font-semibold text-ink">{p.state}</h3>
                  <p className="mt-0.5 text-sm text-muted">{p.name}</p>
                  <ul className="mt-4 space-y-3 text-sm">
                    {p.ratios.slice(0, 3).map((r) => (
                      <li key={r.id} className="text-ink">
                        {r.label} {r.source ? <SourceChip source={r.source} /> : <span className="text-muted">(needs verification)</span>}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-sm text-muted">
                    {p.ratios.length > 3 ? `and ${p.ratios.length - 3} more age group${p.ratios.length - 3 === 1 ? '' : 's'}, ` : ''}
                    {p.mixed ? `plus mixed-age rooms: ${p.mixed.label.replace(/^Mixed ages[^:]*: /, '').toLowerCase()}.` : ''}
                  </p>
                </li>
              ))}
            </ul>
            <p className="mt-6 max-w-3xl text-sm text-muted">
              Clinics and care homes: set your own staffing per service or unit, with your handbook as the source. Those rules show as “your policy”, never as law. Not legal advice:
              confirm the rules that apply to you with your licensing agency.
            </p>

            <div className="mt-14 grid gap-8 lg:grid-cols-2">
              <figure className="min-w-0 rounded-2xl border border-line bg-card p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-ink">Audit log</h3>
                  <Example />
                </div>
                <p className="mt-1 text-sm text-muted">Every change, by a person or an agent. This morning’s call-off, as the log records it:</p>
                <div className="relative mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Example audit log">
                  <table className="w-full min-w-[26rem] text-left text-sm">
                    <caption className="sr-only">Example audit log entries for the call-off</caption>
                    <thead className="text-muted">
                      <tr>
                        <th scope="col" className="py-1.5 pr-3 font-medium">Time</th>
                        <th scope="col" className="py-1.5 pr-3 font-medium">Who</th>
                        <th scope="col" className="py-1.5 font-medium">What</th>
                      </tr>
                    </thead>
                    <tbody className="text-ink tabular-nums">
                      <AuditRow t={hero.event.time} who={`${hero.event.name} · staff app`} what={`Call-off for ${EXAMPLE.date}: 1 cover request`} />
                      <AuditRow t="07:41" who="Director" what={`Requested cover ${EXAMPLE.date} ${hero.gap.from}–${hero.gap.to}: ${hero.options.length} offers sent`} />
                      <AuditRow t="07:52" who={`${steps.accepted.name} · staff app`} what="Accepted a cover offer: filled" />
                      <AuditRow t="16:05" who="Owner" what="Inspector export 2026-11-09 to 2026-11-13" />
                    </tbody>
                  </table>
                </div>
              </figure>

              <figure className="min-w-0 rounded-2xl border border-line bg-card p-5">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-ink">Inspector export</h3>
                  <Example />
                </div>
                <p className="mt-1 text-sm text-muted">
                  For a licensing visit: each room’s ratio checks per day, the rule and its source, every gap and the audit entries, as CSV. Here, {hero.gridFrom}–{hero.gridTo} on
                  the example morning, before cover was found:
                </p>
                <div className="relative mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Example inspector export">
                  <table className="w-full min-w-[26rem] text-left text-sm">
                    <caption className="sr-only">Example ratio checks per room, from the inspector export</caption>
                    <thead className="text-muted">
                      <tr>
                        <th scope="col" className="py-1.5 pr-3 font-medium">Room</th>
                        <th scope="col" className="py-1.5 pr-3 font-medium">Half hours checked</th>
                        <th scope="col" className="py-1.5 pr-3 font-medium">In ratio</th>
                        <th scope="col" className="py-1.5 font-medium">Short</th>
                      </tr>
                    </thead>
                    <tbody className="text-ink tabular-nums">
                      {hero.rooms.map((r) => {
                        const checked = r.cells.filter((c) => c.required > 0);
                        const short = checked.filter((c) => c.after < c.required).length;
                        return (
                          <tr key={r.id} className="border-t border-line">
                            <th scope="row" className="py-2 pr-3 font-medium">{r.name}</th>
                            <td className="py-2 pr-3">{checked.length}</td>
                            <td className="py-2 pr-3">{checked.length - short}</td>
                            <td className={`py-2 ${short ? 'font-semibold text-gap-text' : ''}`}>{short}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-sm text-muted">Each row also lists the rules applied with their sources and read dates. Not legal advice.</p>
              </figure>
            </div>
            <p className="mt-8 flex max-w-3xl gap-2 text-base text-ink">
              <Check />
              <span>
                <strong className="font-semibold">Children stay anonymous.</strong> Only counts per age group, room and half hour. No names, no birthdays, ever.
              </span>
            </p>
          </div>
        </section>

        {/* 4. For staff */}
        <section id="for-staff" className="scroll-mt-20 border-t border-line bg-surface" aria-labelledby="staff-h">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SectionHead id="staff-h" eyebrow="For staff" title="Made for the people on the floor">
              A phone app that installs from the browser and signs in with a passkey. Staff who never open Slack get everything here.
            </SectionHead>
            <div className="mt-12 grid gap-10 md:grid-cols-3">
              <PhoneFrame label="A balance with “why this number”">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">Sick leave</p>
                  <Example />
                </div>
                <p className="text-3xl font-semibold text-ink tabular-nums">16 h</p>
                <div className="rounded-lg border border-line bg-surface p-3 text-sm">
                  <p className="font-semibold text-ink">Why this number</p>
                  <ul className="mt-1 space-y-0.5 text-ink tabular-nums">
                    <li className="flex justify-between"><span>480 h worked ÷ 30</span><span>+16 h</span></li>
                    <li className="flex justify-between"><span>Used</span><span>0 h</span></li>
                  </ul>
                  <p className="mt-1 text-muted">1 hour per 30 worked · Cal. Lab. Code § 246</p>
                </div>
              </PhoneFrame>
              <PhoneFrame label="Ask in your own words">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink">Ask for time off</p>
                  <Example />
                </div>
                <p className="rounded-lg border border-line bg-card p-3 text-sm text-muted">“next Friday and Monday off”</p>
                <div className="rounded-lg border border-line bg-surface p-3 text-sm">
                  <p className="font-semibold text-ink">Fri 13 – Mon 16 Nov</p>
                  <p className="text-ink">2 days of vacation · weekend not counted</p>
                  <p className="mt-1 text-muted">Left after: 12.5 days</p>
                </div>
                <span className="block rounded-md bg-accent py-2 text-center text-sm font-semibold text-white" aria-hidden="true">Send to my manager</span>
              </PhoneFrame>
              <PhoneFrame label="Call in sick in two taps; answer cover offers">
                <span className="block rounded-lg border-2 border-gap-line bg-gap-bg py-3 text-center font-semibold text-gap-text" aria-hidden="true">I can’t come in</span>
                <p className="text-sm text-muted">No reason asked. Your manager sees “out”.</p>
                <div className="rounded-xl border border-line bg-card p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-ink">Cover: {hero.gap.roomName}</p>
                    <Example />
                  </div>
                  <p className="text-sm text-ink">Thu, {hero.gap.from}–{hero.gap.to}</p>
                  <div className="mt-2 grid grid-cols-2 gap-1.5 text-sm" aria-hidden="true">
                    <span className="rounded-lg bg-accent py-2 text-center font-semibold text-white">Take it</span>
                    <span className="rounded-lg border border-line py-2 text-center text-ink">Can’t</span>
                  </div>
                </div>
              </PhoneFrame>
            </div>
            <p className="mt-8 max-w-3xl text-sm text-muted">Explanations in words are written by AI from the engine’s figures only, and every figure in them must match. The figures above are an example.</p>
          </div>
        </section>

        {/* 5. Leave and time clock, briefly */}
        <section id="leave-time" className="scroll-mt-20 border-t border-line" aria-labelledby="leave-time-h">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SectionHead id="leave-time-h" eyebrow="Also included" title="Leave and time clock, in the same place" />
            <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {LEAVE_TIME.map(([title, body]) => (
                <li key={title} className="border-l-2 border-accent pl-4">
                  <h3 className="font-semibold text-ink">{title}</h3>
                  <p className="mt-1 text-sm text-muted">{body}</p>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-sm">
              <Link href="/demo" className="font-medium text-accent underline underline-offset-4">See leave and planning in the walkthrough →</Link>
            </p>
          </div>
        </section>

        {/* 6. Industry presets */}
        <section id="presets" className="scroll-mt-20 border-t border-line bg-surface" aria-labelledby="presets-h">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SectionHead id="presets-h" eyebrow="Presets" title="Start from your kind of team">
              A preset sets the words (room, chair, unit) and suggests rules. You can change everything afterwards.
            </SectionHead>
            <ul className="mt-12 grid gap-6 md:grid-cols-3">
              <PresetCard title="Childcare centres" href="/childcare" tag="Cited rules for CA, TX and NY">
                Staff-to-child ratios and group sizes per age group, mixed-age rooms, qualified staff and hourly sick leave.
              </PresetCard>
              <PresetCard title="Clinics" tag="Your policy, not law">
                Bookings per service and a licensed role on the floor. You set the staffing; your handbook is the source.
              </PresetCard>
              <PresetCard title="Care homes" tag="Your policy, not law">
                Units, licensed roles, rest between shifts and credentials that expire. You set the staffing; your handbook is the source.
              </PresetCard>
            </ul>
            <details className="mt-8 max-w-3xl rounded-xl border border-line bg-card p-4">
              <summary className="cursor-pointer font-medium text-ink">See all presets</summary>
              <ul className="mt-3 space-y-2 text-sm">
                {INDUSTRIES.map((i) => (
                  <li key={i.key}>
                    <span className="font-semibold text-ink">{i.label}</span> <span className="text-muted">· {i.blurb}</span>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </section>

        {/* 7. Trust */}
        <section id="trust" className="scroll-mt-20 border-t border-line" aria-labelledby="trust-h">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SectionHead id="trust-h" eyebrow="Built to be checked" title="Numbers you can show an inspector">
              Staffing and leave are where small mistakes cost the most, so everything is built to be traced.
            </SectionHead>
            <ul className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {TRUST.map(([title, body]) => (
                <li key={title} className="border-l-2 border-accent pl-4">
                  <h3 className="font-semibold text-ink">{title}</h3>
                  <p className="mt-1 text-sm text-muted">{body}</p>
                </li>
              ))}
            </ul>
            <p className="mt-8 text-sm text-muted">
              Building on it? MCP, REST and webhooks are on the{' '}
              <Link href="/developers" className="font-medium text-accent underline underline-offset-4">developers page</Link>.
            </p>
          </div>
        </section>

        <section className="border-t border-line bg-accent-soft" aria-labelledby="cta-h">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 id="cta-h" className="font-serif text-2xl font-semibold tracking-tight text-ink sm:text-3xl">See it with a made-up centre</h2>
              <p className="mt-2 max-w-xl text-ink">Your own private copy of a sample centre or office, deleted after a day. Nothing you do there reaches a real person.</p>
            </div>
            <Link href="/try" className={`${btnPrimary} shrink-0 px-5 py-2.5 text-base`}>Try the demo</Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}

function AuditRow({ t, who, what }: { t: string; who: string; what: string }) {
  return (
    <tr className="border-t border-line align-top">
      <td className="py-2 pr-3 whitespace-nowrap">{t}</td>
      <td className="py-2 pr-3">{who}</td>
      <td className="py-2">{what}</td>
    </tr>
  );
}

function PresetCard({ title, tag, href, children }: { title: string; tag: string; href?: string; children: ReactNode }) {
  return (
    <li className="flex flex-col rounded-2xl border border-line bg-card p-5">
      <p className="text-sm font-medium text-accent">{tag}</p>
      <h3 className="mt-1 text-lg font-semibold text-ink">{title}</h3>
      <p className="mt-2 flex-1 text-sm text-muted">{children}</p>
      {href && (
        <Link href={href} className="mt-4 text-sm font-medium text-accent underline underline-offset-4">
          Childcare in detail<span className="sr-only">: {title}</span> →
        </Link>
      )}
    </li>
  );
}
