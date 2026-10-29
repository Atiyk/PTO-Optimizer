/**
 * Stage 3D: a Flesch-Kincaid Grade Level scorer for glossary copy (P5: grade ~8 target).
 * Deliberately the well-known public formula, not a bespoke heuristic - its syllable
 * counter is a standard approximation (not a dictionary lookup), so scores are an estimate,
 * not an exact grade level; good enough to flag copy that reads as dense, which is all this
 * is used for.
 */

const VOWEL_GROUPS = /[aeiouy]+/g;

/** Approximate syllable count via vowel-group counting, with the common English silent-e
 * and -le exceptions. Never returns 0 for a non-empty word. */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 0;
  let count = (w.match(VOWEL_GROUPS) ?? []).length;
  if (w.endsWith('e') && !w.endsWith('le') && count > 1) count -= 1;
  if (w.endsWith('le') && w.length > 2 && !'aeiouy'.includes(w[w.length - 3])) count += 1;
  return Math.max(1, count);
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+(?:\s|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
}

export interface ReadabilityScore {
  grade: number;
  words: number;
  sentences: number;
  syllables: number;
}

/** Flesch-Kincaid Grade Level: 0.39*(words/sentences) + 11.8*(syllables/words) - 15.59. */
export function fleschKincaidGrade(text: string): ReadabilityScore {
  const sentences = Math.max(1, splitSentences(text).length);
  const words = splitWords(text);
  const wordCount = Math.max(1, words.length);
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  const grade = 0.39 * (wordCount / sentences) + 11.8 * (syllables / wordCount) - 15.59;
  return { grade: Math.max(0, grade), words: wordCount, sentences, syllables };
}
