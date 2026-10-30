import { GLOSSARY_TERMS, type GlossaryTerm } from '../content/glossary/terms';

export interface DecodedMatch {
  term: GlossaryTerm;
  /** The literal phrase found in the text (the term name or one of its aliases), as typed
   * by the user — used to highlight the exact substring, not a normalized form. */
  matchedText: string;
  /** Character offset into the pasted text, for highlighting. */
  index: number;
}

/**
 * Stage 4C: "Decode a paragraph" — literal glossary term/alias matching only, run entirely
 * in the browser (P2: the text itself is never stored, never put in the URL, and this
 * function never mutates or echoes it anywhere persistent). NEVER infers or auto-fills a
 * policy value from the match — only flags which inputs below are worth checking.
 */
export function decodeParagraph(text: string): DecodedMatch[] {
  if (!text) return [];
  const matches: DecodedMatch[] = [];
  // Collapse any whitespace run character to a single space WITHOUT changing length, so a
  // phrase wrapped across a line break ("waiting\nperiod") still matches as "waiting period"
  // while indices into the ORIGINAL text (for highlighting) stay perfectly aligned.
  const lower = text.toLowerCase().replace(/\s/g, ' ');

  for (const term of GLOSSARY_TERMS) {
    const phrases = [term.term, ...term.aliases];
    for (const phrase of phrases) {
      const p = phrase.toLowerCase();
      if (p.length < 3) continue; // avoid noisy matches on very short aliases
      let searchFrom = 0;
      while (true) {
        const idx = lower.indexOf(p, searchFrom);
        if (idx === -1) break;
        matches.push({ term, matchedText: text.slice(idx, idx + phrase.length), index: idx });
        searchFrom = idx + phrase.length;
      }
    }
  }

  return matches.sort((a, b) => a.index - b.index);
}

/** De-duplicated term list from a match set, in first-appearance order — what the
 * "We spotted X, Y, Z" summary line and the input-field highlight hand-off are built from. */
export function uniqueMatchedTerms(matches: DecodedMatch[]): GlossaryTerm[] {
  const seen = new Set<string>();
  const out: GlossaryTerm[] = [];
  for (const m of matches) {
    if (seen.has(m.term.id)) continue;
    seen.add(m.term.id);
    out.push(m.term);
  }
  return out;
}
