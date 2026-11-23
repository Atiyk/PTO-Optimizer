import type { ReactNode } from 'react';
import { SiteHeader } from './SiteHeader';
import { Footer } from './Footer';
import { Container } from './Container';
import { Button } from './Button';
import { Callout } from './Callout';
import { track } from './analytics';
import { formatDay, formatLongDate, formatRange, plural } from '../content/guides/guideFormat';
import type { GuidePlan } from '../content/guides/guidePlan';
import {
  EXPIRING_2026, GUIDES, GUIDE_HUB, SOURCES, expiringFacts, findGuide, guideFacts,
  type Guide, type GuideFacts, type GuidePlanConfig,
} from '../content/guides/guides2027';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';
const TEXT_LINK = `inline-flex min-h-11 items-center ${FOCUS}`;

function openPlan() {
  track('guide_plan_opened');
}

function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return <h2 id={id} className="text-h2 font-bold text-ink type-condensed">{children}</h2>;
}

function leaveWord(guide: Guide): string {
  return guide.country === 'GB' ? 'Leave' : 'PTO days';
}

function PlanTable({ plan, guide, caption, detail }: { plan: GuidePlan; guide: Guide; caption: string; detail: boolean }) {
  const style = guide.dateStyle;
  return (
    <table className="mt-4 w-full border-collapse text-left tabular-nums">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="border-b border-ink text-sm text-muted">
          <th scope="col" className="py-2 pr-3 font-semibold">Break</th>
          <th scope="col" className="py-2 pr-3 text-right font-semibold">{leaveWord(guide)}</th>
          <th scope="col" className="py-2 text-right font-semibold">Days off</th>
        </tr>
      </thead>
      <tbody>
        {plan.breaks.map((b) => (
          <tr key={b.start} className="border-b border-line align-top">
            <td className="py-2.5 pr-3">
              <span className="block font-semibold text-ink">{formatRange(b.start, b.end, style)}</span>
              {detail && (
                <span className="block text-sm text-muted">
                  Request {b.ptoDays.map((d) => formatDay(d, style)).join('; ')}
                </span>
              )}
            </td>
            <td className="py-2.5 pr-3 text-right text-ink">{b.ptoCost}</td>
            <td className="py-2.5 text-right font-bold text-ink">{b.totalDaysOff}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="text-ink">
          <th scope="row" className="py-2.5 pr-3 text-left font-semibold">Total</th>
          <td className="py-2.5 pr-3 text-right font-semibold">{plan.ptoUsed}</td>
          <td className="py-2.5 text-right font-bold">{plan.daysOff}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function PlanBlock({ config, plan, f, primary }: { config: GuidePlanConfig; plan: GuidePlan; f: GuideFacts; primary: boolean }) {
  const headingId = `plan-${config.id}`;
  const title = config.title(plan, f);
  const body = (
    <>
      <h2 id={headingId} className={primary ? 'text-h1 text-ink type-display' : 'text-h2 font-bold text-ink type-condensed'}>{title}</h2>
      <p className="mt-2 max-w-[68ch] text-ink">{config.note(plan, f)}</p>
      <PlanTable plan={plan} guide={f.guide} caption={title} detail={primary} />
      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button href={plan.href} variant={primary ? 'primary' : 'secondary'} onClick={openPlan} className="whitespace-normal text-center">
          {primary ? 'Open this plan in Timebower' : 'Open this version'} <span aria-hidden="true">→</span>
        </Button>
        {primary && <p className="text-sm text-muted">Same dates, live, with your own holidays and numbers. No account needed.</p>}
      </div>
    </>
  );
  return primary
    ? <section className="plan-card mt-8 p-5 sm:p-7" aria-labelledby={headingId}>{body}</section>
    : <section className="mt-10 border-t border-line pt-8" aria-labelledby={headingId}>{body}</section>;
}

function HolidayTable({ f }: { f: GuideFacts }) {
  const style = f.guide.dateStyle;
  const heading = `${f.guide.year} ${f.guide.holidayWord}${f.guide.country === 'GB' ? ' in England and Wales' : ''}`;
  return (
    <section className="mt-12" aria-labelledby="holidays-heading">
      <SectionHeading id="holidays-heading">{heading}</SectionHeading>
      <p className="mt-2 max-w-[68ch] text-muted">The dates the plans above count as days off, with the day of the week each one is observed.</p>
      <table className="mt-4 w-full border-collapse text-left tabular-nums">
        <caption className="sr-only">{heading}</caption>
        <thead>
          <tr className="border-b border-ink text-sm text-muted">
            <th scope="col" className="py-2 pr-3 font-semibold">Holiday</th>
            <th scope="col" className="py-2 font-semibold">Date</th>
          </tr>
        </thead>
        <tbody>
          {f.holidays.map((h) => (
            <tr key={h.date} className="border-b border-line">
              <td className="py-2.5 pr-3 text-ink">{h.name}{f.guide.country === 'US' && h.date.endsWith('-12-31') ? ' (2028, observed)' : ''}</td>
              <td className="py-2.5 whitespace-nowrap text-ink">{formatDay(h.date, style)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function LongWeekendTable({ f }: { f: GuideFacts }) {
  const style = f.guide.dateStyle;
  const leave = f.guide.country === 'GB' ? 'day of leave' : 'PTO day';
  return (
    <section className="mt-12" aria-labelledby="weekends-heading">
      <SectionHeading id="weekends-heading">Each holiday, with and without one {leave}</SectionHeading>
      <p className="mt-2 max-w-[68ch] text-muted">Days off in a row around each holiday with no {f.guide.country === 'GB' ? 'leave' : 'PTO'}, then with the one {leave} that adds the most.</p>
      <table className="mt-4 w-full border-collapse text-left tabular-nums">
        <caption className="sr-only">{`${f.guide.year} holidays with and without one ${leave}`}</caption>
        <thead>
          <tr className="border-b border-ink text-sm text-muted">
            <th scope="col" className="py-2 pr-3 font-semibold">Holiday</th>
            <th scope="col" className="py-2 pr-3 text-right font-semibold">Free</th>
            <th scope="col" className="py-2 font-semibold">Take off</th>
            <th scope="col" className="py-2 text-right font-semibold">Days off</th>
          </tr>
        </thead>
        <tbody>
          {f.weekends.map((w) => (
            <tr key={w.date} className="border-b border-line align-top">
              <td className="py-2.5 pr-3">
                <span className="block text-ink">{w.name}</span>
                <span className="block text-sm text-muted">{formatDay(w.date, style)}</span>
              </td>
              <td className="py-2.5 pr-3 text-right text-ink">{w.free.length}</td>
              <td className="py-2.5 pr-3 text-ink">{w.withOneDay ? formatDay(w.withOneDay.date, style) : <span className="text-muted">Already your day off</span>}</td>
              <td className="py-2.5 text-right font-bold text-ink">{w.withOneDay ? w.withOneDay.run.length : w.free.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 max-w-[68ch] text-sm text-muted">A run that reaches past December 31 is counted to its real end here. The planner links plan inside {f.guide.year} only.</p>
    </section>
  );
}

function ExpiringSection() {
  const e = expiringFacts();
  const gap = e.gapFills[0];
  return (
    <section className="mt-12 rounded-[10px] border border-line bg-surface p-5 sm:p-6" aria-labelledby="expiring-heading">
      <h2 id="expiring-heading" className="text-lg font-bold text-ink">Days expiring December 31, 2026? The last holidays of 2026</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-ink marker:text-muted">
        {e.weekends.map((w) => w.withOneDay && (
          <li key={w.date} className="pl-1">
            {w.name}, {formatDay(w.date, 'US')}: take {formatDay(w.withOneDay.date, 'US')} for <span className="mark">{w.withOneDay.run.length} days off</span> ({formatRange(w.withOneDay.run.start, w.withOneDay.run.end, 'US')}).
          </li>
        ))}
        {gap && (
          <li className="pl-1">
            Christmas to New Year: {plural(gap.ptoDays.length, 'PTO day')}, {formatRange(gap.ptoDays[0], gap.ptoDays.at(-1)!, 'US')}, give <span className="mark">{gap.run.length} days off</span> ({formatRange(gap.run.start, gap.run.end, 'US')}).
          </li>
        )}
      </ul>
      <p className="mt-3 text-sm text-muted">From {formatDay(EXPIRING_2026.from, 'US', true)}. Whether unused days expire depends on your policy.</p>
      <p>
        <a href="/policy" className={TEXT_LINK}><span className="link-mark">Check what expires and when, in My PTO</span></a>
      </p>
    </section>
  );
}

function GuideList({ current }: { current: Guide }) {
  const others = GUIDES.filter((g) => g.path !== current.path);
  return (
    <section className="mt-12" aria-labelledby="more-guides-heading">
      <SectionHeading id="more-guides-heading">{current === GUIDE_HUB ? 'The 2027 guides' : 'More 2027 guides'}</SectionHeading>
      <ul className="mt-3 border-t border-line">
        {others.map((g) => {
          return (
            <li key={g.path} className="border-b border-line">
              <a href={g.path} className={`${TEXT_LINK} font-semibold`}><span className="link-mark">{g.navLabel}</span></a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NotFound() {
  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="glossary" />
      <main id="main-content" tabIndex={-1}>
        <Container className="px-4 py-12 sm:px-6">
          <h1 className="text-h1 text-ink type-display">Guide not found</h1>
          <p className="mt-3"><a href={GUIDE_HUB.path} className={`link-mark ${FOCUS}`}>See the 2027 guides</a></p>
        </Container>
      </main>
      <Footer />
    </div>
  );
}

/**
 * /2027 and /2027/<slug>: a Read page with one answer. Heading, the answer in two or three
 * sentences, then the plan card (the page's one raised object) with its link into /pto.
 * Every number comes from guideFacts, computed from the committed holiday files at render.
 */
export function GuidePage({ path }: { path: string }) {
  const guide = findGuide(path);
  if (!guide) return <NotFound />;
  const f = guideFacts(guide);
  const [first, ...rest] = guide.plans;
  const style = guide.dateStyle;
  const isHub = guide === GUIDE_HUB;

  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="glossary" />
      <main id="main-content" tabIndex={-1}>
        <Container className="px-4 pt-6 pb-4 sm:px-6 lg:pt-10">
          <nav aria-label="Breadcrumb" className="text-sm text-muted">
            <ol className="flex flex-wrap items-center gap-x-1.5">
              <li><a href="/" className={`${TEXT_LINK} hover:text-ink`}><span className="underline decoration-1 underline-offset-[0.22em]">Timebower</span></a></li>
              <li aria-hidden="true">/</li>
              {isHub ? (
                <li aria-current="page" className="inline-flex min-h-11 items-center text-ink">2027 guides</li>
              ) : (
                <>
                  <li><a href={GUIDE_HUB.path} className={`${TEXT_LINK} hover:text-ink`}><span className="underline decoration-1 underline-offset-[0.22em]">2027 guides</span></a></li>
                  <li aria-hidden="true">/</li>
                  <li aria-current="page" className="inline-flex min-h-11 items-center text-ink">{guide.navLabel}</li>
                </>
              )}
            </ol>
          </nav>

          <article className="mt-2 max-w-[68ch] lg:max-w-[76ch]" aria-labelledby="guide-heading">
            <h1 id="guide-heading" className="text-display-sm text-ink type-display">{guide.h1}</h1>
            <p className="mt-5 border-t border-ink pt-5 text-[19px] leading-8 text-ink">{guide.answer(f)}</p>
            <p className="mt-3 text-sm text-muted">
              Last checked {formatLongDate(guide.lastChecked, style)}. Holiday dates: {[...new Set(guide.sources.filter((s) => s !== 'nager').map((s) => SOURCES[s].label.split(',')[0]))].join(', ')}, and Nager.Date.
            </p>

            <PlanBlock config={first} plan={f.plans[0]} f={f} primary />

            <section className="mt-8" aria-labelledby="assumptions-heading">
              <h2 id="assumptions-heading" className="text-lg font-bold text-ink">What these numbers assume</h2>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-ink marker:text-muted">
                {guide.assumptions(f).map((line) => <li key={line} className="pl-1">{line}</li>)}
              </ul>
              {!guide.show.holidayTable && !guide.show.longWeekends && (
                <p className="mt-3 text-[15px] leading-6 text-muted">
                  The {f.holidays.length} dates: {f.holidays.map((h) => formatDay(h.date, style)).join('; ')}. <a href={GUIDE_HUB.path} className={`link-mark ${FOCUS}`}>Names and weekdays</a>.
                </p>
              )}
            </section>

            <Callout tone="neutral" title="Days off and PTO days are different counts" className="mt-8">
              {guide.country === 'GB' ? 'Days of leave' : 'PTO days'} are the working days you ask for. Days off counts every day in a row you are not working: weekends, holidays and {guide.country === 'GB' ? 'leave' : 'PTO'} together. One {guide.country === 'GB' ? 'day of leave' : 'PTO day'} on the Friday before a Monday holiday is <span className="mark">4 days off</span> for 1 {guide.country === 'GB' ? 'day of leave' : 'PTO day'}.
            </Callout>

            <section className="mt-12" aria-labelledby="why-heading">
              <SectionHeading id="why-heading">Why these dates</SectionHeading>
              <div className="mt-3 space-y-3 text-[17px] leading-7 text-ink">
                {guide.why(f).map((line) => <p key={line}>{line}</p>)}
              </div>
            </section>

            {rest.map((config, i) => <PlanBlock key={config.id} config={config} plan={f.plans[i + 1]} f={f} primary={false} />)}

            {guide.show.holidayTable && <HolidayTable f={f} />}
            {guide.show.longWeekends && <LongWeekendTable f={f} />}
            {guide.show.expiring && <ExpiringSection />}

            <section className="mt-12" aria-labelledby="faq-heading">
              <SectionHeading id="faq-heading">Questions</SectionHeading>
              <div className="mt-2 border-t border-line">
                {guide.faqs.map((faq) => (
                  <div key={faq.id} id={`faq-${faq.id}`} className="scroll-mt-6 border-b border-line py-4">
                    <h3 className="text-[17px] font-semibold leading-6 text-ink">{faq.question}</h3>
                    <p className="mt-1.5 leading-7 text-ink">{faq.answer(f)}</p>
                  </div>
                ))}
              </div>
            </section>

            <GuideList current={guide} />

            <section className="mt-12" aria-labelledby="tools-heading">
              <SectionHeading id="tools-heading">Plan your own</SectionHeading>
              <ul className="mt-2">
                <li><a href="/pto" className={TEXT_LINK}><span className="link-mark">Plan time off with your own PTO and dates</span></a></li>
                <li><a href="/policy" className={TEXT_LINK}><span className="link-mark">Check your balance, carryover and expiry in My PTO</span></a></li>
                <li><a href="/faq" className={TEXT_LINK}><span className="link-mark">How the planner works (FAQ)</span></a></li>
                <li><a href="/data-sources" className={TEXT_LINK}><span className="link-mark">Where the holiday data comes from</span></a></li>
              </ul>
            </section>

            <section className="mt-10 border-t border-line pt-5 text-sm text-muted" aria-labelledby="sources-heading">
              <h2 id="sources-heading" className="font-semibold text-ink">Sources</h2>
              <ul className="mt-1">
                {guide.sources.map((id) => (
                  <li key={id}>
                    <a href={SOURCES[id].href} className={TEXT_LINK} {...(SOURCES[id].href.startsWith('http') ? { rel: 'noopener noreferrer' } : {})}>
                      <span className="link-mark">{SOURCES[id].label}</span>
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-2">Plans computed by the Timebower planner from the holiday data it ships with. Planning help, not HR or legal advice.</p>
            </section>
          </article>
        </Container>
      </main>
      <Footer />
    </div>
  );
}
