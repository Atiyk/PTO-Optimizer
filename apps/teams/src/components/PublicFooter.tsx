import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { PRODUCT_NAME, PRODUCT_TAGLINE } from '@/lib/brand';

const COLUMNS: [title: string, links: [href: string, text: string][]][] = [
  ['Try it', [['/try', 'Try the demo'], ['/demo/coverage', 'Coverage walkthrough'], ['/demo', 'Leave planner walkthrough']]],
  ['Product', [['/#product', 'For managers and staff'], ['/#coverage', 'Staff cover and ratios'], ['/#integrations', 'Integrations']]],
  ['Developers', [['/docs/agents', 'MCP and REST for AI agents'], ['/llms.txt', 'llms.txt'], ['/status', 'Service status']]],
];

export function PublicFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <p className="flex items-center gap-2 font-semibold text-ink">
            <Logo className="h-6 w-6" />
            {PRODUCT_NAME}
          </p>
          <p className="mt-2 max-w-xs text-sm text-muted">{PRODUCT_TAGLINE}</p>
          <p className="mt-4 text-sm text-muted">Early preview. No pricing yet.</p>
        </div>
        {COLUMNS.map(([title, links]) => (
          <nav key={title} aria-label={title}>
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {links.map(([href, text]) => (
                <li key={href}>
                  <Link href={href} className="text-muted underline-offset-4 hover:text-ink hover:underline">{text}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-muted">
        Made by the people behind Days Off, the free planner for your own time off. Staffing rules are shown with their sources and are not legal advice.
      </p>
    </footer>
  );
}
