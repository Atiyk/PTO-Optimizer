import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { Chip } from '../ui/Chip';
import { Card } from '../ui/Card';
import { StatNumber } from '../ui/StatNumber';
import { Callout } from '../ui/Callout';
import { Countdown } from '../ui/Countdown';
import { Logo, LogoMark } from '../ui/Logo';
import { SiteHeader, type SiteRoute } from '../ui/SiteHeader';
import { Footer } from '../ui/Footer';
import { Container } from '../ui/Container';

/**
 * Redesign Phase 1: every component in every state, dev only (/_dev/ui/ under `npm run dev`;
 * never built). The top-level page shows the gallery three times, in iframes at 375, 768
 * and 1440px, so all three widths are visible at once; `?bare` renders one copy.
 */
const WIDTHS = [375, 768, 1440];

const SWATCHES: [string, string][] = [
  ['--bg-page', 'page'],
  ['--bg-surface', 'surface'],
  ['--bg-surface-alt', 'surface-alt'],
  ['--border-default', 'line'],
  ['--border-strong', 'line-strong'],
  ['--text-primary', 'ink'],
  ['--text-muted', 'muted'],
  ['--accent', 'accent'],
  ['--accent-hover', 'accent-hover'],
  ['--accent-soft', 'accent-soft'],
  ['--band-bg', 'band'],
  ['--holiday-dot', 'holiday'],
  ['--weekend-bg', 'weekend'],
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-8">
      <h2 className="mb-5 text-h2 font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
      <span className="w-40 shrink-0 text-sm text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function Bare() {
  const [n, setN] = useState(38);
  const [toggled, setToggled] = useState(true);
  const routes: SiteRoute[] = ['landing', 'pto', 'sabbatical', 'policy', 'glossary'];
  return (
    <div className="min-h-screen bg-page">
      <SiteHeader active="pto" />
      <Container className="px-4 py-8 sm:px-6">
        <h1 className="text-h1 font-semibold tracking-[-0.02em] text-ink">UI gallery</h1>
        <p className="mt-2 text-muted">Every component in every state. Tab through the page to see focus rings.</p>

        <Section title="Tokens">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {SWATCHES.map(([v, name]) => (
              <div key={v} className="overflow-hidden rounded-xl border border-line bg-surface">
                <div className="h-14" style={{ background: `var(${v})` }} />
                <div className="px-3 py-2 text-xs">
                  <div className="font-semibold text-ink">{name}</div>
                  <div className="text-muted">{v}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Type">
          <p className="text-display-sm font-semibold tracking-[-0.03em] text-ink sm:text-display">38 days off</p>
          <p className="text-h1 font-semibold tracking-[-0.02em] text-ink">Make every PTO day count.</p>
          <p className="text-h2 font-semibold text-ink">Next long weekend</p>
          <p className="text-body text-ink">Body 16/24. The quick brown fox takes Friday off. 0123456789</p>
          <p className="text-small text-muted">Small 14/20, muted. 1111 vs 0000 (tabular figures line up)</p>
        </Section>

        <Section title="Logo">
          <Row label="Wordmark">
            <Logo />
          </Row>
          <Row label="Mark sizes">
            {[16, 24, 32, 48, 64].map((s) => (
              <LogoMark key={s} size={s} />
            ))}
          </Row>
        </Section>

        <Section title="Button">
          {(['primary', 'secondary', 'quiet'] as const).map((v) => (
            <Row key={v} label={v}>
              <Button variant={v}>See the full plan →</Button>
              <Button variant={v} size="sm">
                Copy link
              </Button>
              <Button variant={v} disabled>
                Disabled
              </Button>
              <Button variant={v} href="#">
                As a link
              </Button>
            </Row>
          ))}
        </Section>

        <Section title="Chip">
          <Row label="Static">
            <Chip>Free, no sign-up</Chip>
            <Chip tone="accent">3.8×</Chip>
          </Row>
          <Row label="Toggle">
            <Chip onClick={() => setToggled((t) => !t)} selected={toggled}>
              Selected: {String(toggled)}
            </Chip>
            <Chip onClick={() => undefined} selected={false}>
              Not selected
            </Chip>
            <Chip tone="accent" onClick={() => undefined} selected>
              Accent selected
            </Chip>
          </Row>
        </Section>

        <Section title="Card, StatNumber, Countdown">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card eyebrow="Your year">
              <StatNumber value={n} label="days off from 10 PTO days" prefix="→" />
              <div className="mt-4 flex items-center gap-2">
                <Chip tone="accent">3.8×</Chip>
                <Button size="sm" variant="secondary" onClick={() => setN((x) => x + 1)}>
                  Change value (motion)
                </Button>
              </div>
            </Card>
            <Card eyebrow="Next long weekend">
              <StatNumber size="lg" value={4} label="days off for 1 PTO day" />
              <p className="mt-3 text-muted">
                Thanksgiving, <Countdown days={26} date="2026-11-26" emphasis />
              </p>
            </Card>
            <Card eyebrow="Countdown states">
              <ul className="flex flex-col gap-1 text-ink">
                <li>
                  <Countdown days={0} />
                </li>
                <li>
                  <Countdown days={1} />
                </li>
                <li>
                  <Countdown days={26} emphasis />
                </li>
              </ul>
              <StatNumber className="mt-3" size="md" value="104" label="days with no holiday" />
            </Card>
            <Card>
              <p className="text-ink">A card with no eyebrow.</p>
            </Card>
            <Card padded={false}>
              <p className="p-3 text-ink">Unpadded card (content sets its own padding).</p>
            </Card>
          </div>
        </Section>

        <Section title="Callout">
          <div className="flex max-w-2xl flex-col gap-3">
            <Callout title="Fri 27 Nov" why="Bridges Thanksgiving: 1 PTO day for 4 days off.">
              Take the Friday after Thanksgiving.
            </Callout>
            <Callout tone="neutral" title="104 days with no holiday (Feb–May)">
              The longest dry spell in your next 12 months.
            </Callout>
            <Callout>Body only, no title.</Callout>
          </div>
        </Section>

        <Section title="Header (each active state)">
          <div className="flex flex-col gap-3">
            {routes.map((r) => (
              <div key={r} className="overflow-hidden rounded-xl border border-line">
                <SiteHeader active={r} />
              </div>
            ))}
          </div>
        </Section>
      </Container>
      <Footer onShowShortcuts={() => undefined} />
    </div>
  );
}

function Frame({ width }: { width: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1200);
  useEffect(() => {
    const id = window.setInterval(() => {
      const doc = ref.current?.contentDocument;
      if (doc) setHeight(doc.documentElement.scrollHeight);
    }, 500);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-ink">{width}px</p>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface">
        <iframe ref={ref} title={`Gallery at ${width}px`} src="?bare" width={width} height={height} className="block border-0" />
      </div>
    </div>
  );
}

export function UiGallery() {
  if (new URLSearchParams(window.location.search).has('bare')) return <Bare />;
  return (
    <div className="min-h-screen bg-page p-4 sm:p-6">
      <h1 className="text-h2 font-semibold text-ink">UI gallery at 375 / 768 / 1440px</h1>
      <p className="mb-6 text-muted">
        Dev only. Open <a className="text-accent-ink underline" href="?bare">?bare</a> for a single copy at this window's width.
      </p>
      <div className="flex flex-col gap-10">
        {WIDTHS.map((w) => (
          <Frame key={w} width={w} />
        ))}
      </div>
    </div>
  );
}
