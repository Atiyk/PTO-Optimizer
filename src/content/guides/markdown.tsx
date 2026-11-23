import type { ReactNode } from 'react';

/**
 * The small Markdown subset guide bodies are written in. No dependency: the guides are our
 * own trusted strings, and the subset is only what they use.
 *
 * Blocks (separated by a blank line):
 *   ## Heading            h2, with an id from its text
 *   ### Heading           h3
 *   - item                bullet list (one item per line)
 *   1. item               numbered list
 *   | a | b |             table: first row is the header, second the |---| separator
 *   > text                callout (several > lines join into one)
 *   anything else         paragraph (lines join with a space)
 * Inline: **bold** and [text](href). Nothing else is interpreted.
 */

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';
const INLINE = /(\*\*.+?\*\*|\[[^\]]+\]\([^)\s]+\))/g;

export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/\*\*/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

export function renderInline(text: string, keyPrefix = 'i'): ReactNode[] {
  const parts = text.split(INLINE).filter((p) => p !== '');
  return parts.map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={key} className="font-semibold text-ink">{renderInline(part.slice(2, -2), key)}</strong>;
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const [, label, href] = link;
      const external = /^https?:\/\//.test(href);
      return (
        <a key={key} href={href} className={`link-mark ${FOCUS}`} {...(external ? { rel: 'noopener noreferrer' } : {})}>
          {renderInline(label, key)}
        </a>
      );
    }
    return part;
  });
}

/** Every link target in a body, in order, for tests. */
export function linkTargets(markdown: string): string[] {
  return [...markdown.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)].map((m) => m[1]);
}

/** The h2 headings, for the page's table of contents. */
export function h2Headings(markdown: string): { id: string; text: string }[] {
  return markdown
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => {
      const text = line.slice(3).trim();
      return { id: headingId(text), text: text.replace(/\*\*/g, '') };
    });
}

function cells(row: string): string[] {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function block(lines: string[], index: number): ReactNode {
  const key = `b-${index}`;
  const first = lines[0];
  if (first.startsWith('### ')) {
    const text = first.slice(4).trim();
    return <h3 key={key} id={headingId(text)} className="mt-8 text-lg font-bold text-ink">{renderInline(text, key)}</h3>;
  }
  if (first.startsWith('## ')) {
    const text = first.slice(3).trim();
    return <h2 key={key} id={headingId(text)} className="mt-12 scroll-mt-6 text-h2 font-bold text-ink type-condensed">{renderInline(text, key)}</h2>;
  }
  if (lines.every((l) => l.startsWith('- '))) {
    return (
      <ul key={key} className="mt-4 list-disc space-y-2 pl-5 text-ink marker:text-muted">
        {lines.map((l, i) => <li key={i} className="pl-1">{renderInline(l.slice(2), `${key}-${i}`)}</li>)}
      </ul>
    );
  }
  if (lines.every((l) => /^\d+\. /.test(l))) {
    return (
      <ol key={key} className="mt-4 list-decimal space-y-2 pl-5 text-ink marker:text-muted">
        {lines.map((l, i) => <li key={i} className="pl-1">{renderInline(l.replace(/^\d+\. /, ''), `${key}-${i}`)}</li>)}
      </ol>
    );
  }
  if (lines.every((l) => l.startsWith('|'))) {
    const [head, , ...rows] = lines;
    const labels = cells(head).map((c) => c.replace(/\*\*/g, ''));
    return (
      <div key={key} className="mt-5 sm:overflow-x-auto">
        <table className="guide-table w-full sm:min-w-[30rem] border-collapse text-left text-[15px] leading-6 tabular-nums">
          <thead>
            <tr>{cells(head).map((c, i) => <th key={i} scope="col" className="border-b border-ink py-2 pr-4 font-semibold text-ink">{renderInline(c, `${key}-h${i}`)}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>{cells(r).map((c, ci) => <td key={ci} data-label={labels[ci]} className="border-b border-line py-2 pr-4 align-top text-ink">{renderInline(c, `${key}-${ri}-${ci}`)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (lines.every((l) => l.startsWith('>'))) {
    const text = lines.map((l) => l.replace(/^>\s?/, '')).join(' ');
    return (
      <div key={key} className="mt-6 rounded-[10px] bg-accent-soft px-4 py-3 text-[16px] leading-7 text-ink">
        {renderInline(text, key)}
      </div>
    );
  }
  return <p key={key} className="mt-4 text-[17px] leading-7 text-ink">{renderInline(lines.join(' '), key)}</p>;
}

export function renderGuideMarkdown(markdown: string): ReactNode[] {
  const blocks = markdown
    .trim()
    .split(/\n\s*\n/)
    .map((b) => b.split('\n').map((l) => l.trimEnd()).filter((l) => l !== ''))
    .filter((b) => b.length > 0);
  return blocks.map((lines, i) => block(lines, i));
}
