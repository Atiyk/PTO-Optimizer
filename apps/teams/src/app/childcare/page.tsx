import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicFooter } from '@/components/PublicFooter';
import { PublicHeader } from '@/components/PublicHeader';
import { SourceChip } from '@/components/SourceChip';
import { btnPrimary, btnSecondary } from '@/components/ui';
import { serif } from '@/components/marketing/fonts';
import { Check, SectionHead } from '@/components/marketing/parts';
import { childcarePacks } from '@/components/marketing/rulesExample';
import { PRODUCT_NAME } from '@/lib/brand';

/*
 * The childcare preset in detail: what the product checks for a licensed centre, and every
 * ratio rule in the CA, TX and NY packs with its source, read from the engine's rule packs
 * (rulesExample.ts). The packs' own notes say what is not modelled yet; they are shown as is.
 */

export const metadata: Metadata = {
  title: `Childcare centres · ${PRODUCT_NAME}`,
  description: 'Staff-to-child ratios per room and half hour for California, Texas and New York centres, each rule with its regulation and the date it was read.',
};

const CHECKS: [title: string, body: string][] = [
  ['Ratios and group sizes per room', 'For every half hour, from the children booked per age group: staff required, staff counted, and any gap with the rule it breaks.'],
  ['Mixed-age rooms, your state’s way', 'California and New York staff for the youngest child; Texas uses the middle child’s age. The engine follows the pack you choose.'],
  ['Who counts in ratio', 'Teacher permits, CPR and other credentials you track. A credential that expires drops out of ratio from that day, and you hear about it 30, 14 and 7 days before.'],
  ['Call-offs and cover', 'Two taps from the staff app; the gap appears with its rule; cover is ranked by who may legally take it, then by fairness.'],
  ['Hourly sick leave', 'Accrued from hours worked, with caps and carryover. Where a state rule applies, it is shown with its source.'],
  ['Ready for a licensing visit', 'An inspector export with ratio checks per room and day, the rules and their sources, every gap and the audit log.'],
];

export default function Childcare() {
  const packs = childcarePacks();
  return (
    <div className={serif.variable}>
      <PublicHeader />
      <main>
        <section className="bg-page" aria-labelledby="childcare-h">
          <div className="mx-auto max-w-4xl px-4 pt-14 pb-16 sm:pt-20">
            <p className="text-sm font-semibold text-accent">Childcare centres</p>
            <h1 id="childcare-h" className="mt-3 font-serif text-4xl leading-tight font-semibold tracking-tight text-balance text-ink sm:text-5xl">
              Every room in ratio, with the regulation beside each rule
            </h1>
            <p className="mt-5 max-w-2xl text-lg text-muted">
              For licensed centres with 10 to 150 staff. Choose your state’s pack, enter how many children you expect per room, and see each half hour against the rule, before
              anyone calls in sick and after.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/try" className={`${btnPrimary} px-5 py-2.5 text-base`}>Try the sample centre</Link>
              <Link href="/demo/coverage" className={`${btnSecondary} px-5 py-2.5 text-base`}>See the walkthrough</Link>
            </div>
          </div>
        </section>

        <section className="border-t border-line bg-surface" aria-labelledby="checks-h">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <SectionHead id="checks-h" eyebrow="What it checks" title="The rules a director checks by hand, checked every half hour" />
            <ul className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {CHECKS.map(([title, body]) => (
                <li key={title} className="flex gap-3">
                  <Check />
                  <div>
                    <h3 className="font-semibold text-ink">{title}</h3>
                    <p className="mt-1 text-sm text-muted">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-line" aria-labelledby="packs-h">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <SectionHead id="packs-h" eyebrow="State rule packs" title="California, Texas and New York, rule by rule">
              Each rule shows its regulation and section; select it for the quoted text and the date we read it. Other states: set your own ratios, with your handbook as the source.
            </SectionHead>
            <div className="mt-10 space-y-10">
              {packs.map((p) => (
                <article key={p.state} aria-labelledby={`pack-${p.state}`} className="rounded-2xl border border-line bg-card p-5 sm:p-6">
                  <h3 id={`pack-${p.state}`} className="text-xl font-semibold text-ink">{p.state}</h3>
                  <p className="mt-0.5 text-sm text-muted">{p.name}</p>
                  <ul className="mt-4 divide-y divide-line text-sm">
                    {[...p.ratios, ...(p.mixed ? [p.mixed] : [])].map((r) => (
                      <li key={r.id} className="py-2.5 text-ink">
                        {r.label} {r.source ? <SourceChip source={r.source} /> : null}
                        {r.needsVerification && <span className="ml-1 text-muted">(needs verification)</span>}
                      </li>
                    ))}
                  </ul>
                  {p.notes.length > 0 && (
                    <div className="mt-4 rounded-lg bg-surface p-3 text-sm">
                      <p className="font-semibold text-ink">Not modelled yet</p>
                      <ul className="mt-1 list-disc space-y-1 pl-5 text-muted">
                        {p.notes.map((n) => (
                          <li key={n}>{n}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              ))}
            </div>
            <p className="mt-8 max-w-3xl text-sm text-muted">
              Not legal advice. Some sources are faithful copies of the official code (marked in each source); confirm the rules that apply to you with your licensing agency.
            </p>
          </div>
        </section>

        <section className="border-t border-line bg-surface" aria-labelledby="privacy-h">
          <div className="mx-auto max-w-4xl px-4 py-16">
            <h2 id="privacy-h" className="font-serif text-3xl font-semibold tracking-tight text-ink">Children stay anonymous</h2>
            <p className="mt-4 text-lg text-muted">
              {PRODUCT_NAME} only ever holds counts: how many children per age group, room and half hour. No names, birthdays, addresses, guardians or medical details, and there is no
              field to put them in. Staff call-off reasons are not stored either.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/try" className={`${btnPrimary} px-5 py-2.5 text-base`}>Try the sample centre</Link>
              <Link href="/" className={`${btnSecondary} px-5 py-2.5 text-base`}>Back to the overview</Link>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
