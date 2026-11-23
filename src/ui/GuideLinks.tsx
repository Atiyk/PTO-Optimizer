/**
 * Links into the 2027 guides for other pages (footer, homepage). Plain data plus one small
 * list component; it deliberately does not import the guide config or the solver, so a page
 * that shows these links pays nothing for them. guideLinks.test.ts keeps the list in step
 * with src/content/guides/guides2027.ts.
 */
import { GUIDE_LINKS_2027 } from './guideLinkList';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';

/** A titled list of the 2027 guides, styled like the site's other text-link lists. */
export function Guides2027Links({ title = 'Planning 2027', className = '' }: { title?: string; className?: string }) {
  return (
    <nav aria-labelledby="guides-2027-heading" className={className}>
      <h2 id="guides-2027-heading" className="text-h2 font-bold text-ink type-condensed">{title}</h2>
      <ul className="mt-2 border-t border-line">
        {GUIDE_LINKS_2027.map((link) => (
          <li key={link.href} className="border-b border-line">
            <a href={link.href} className={`inline-flex min-h-11 items-center font-semibold ${FOCUS}`}>
              <span className="link-mark">{link.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
