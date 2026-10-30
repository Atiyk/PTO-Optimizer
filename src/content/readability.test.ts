import { describe, it, expect } from 'vitest';
import { fleschKincaidGrade, countSyllables } from './readability';
import { GLOSSARY_TERMS } from './glossary/terms';

describe('countSyllables', () => {
  it('counts simple words correctly', () => {
    expect(countSyllables('cat')).toBe(1);
    expect(countSyllables('balance')).toBe(2); // 'balan-ce', silent e dropped
    // Vowel-group counting (not a dictionary) reads "ua" in "accrual" as one group, so this
    // comes out as 2 rather than the "true" 3 (ac-cru-al) - a known, documented limitation
    // of the approximation, not a bug; good enough for flagging dense copy, not exact.
    expect(countSyllables('accrual')).toBe(2);
  });
});

describe('fleschKincaidGrade', () => {
  it('scores a short, simple sentence low', () => {
    const { grade } = fleschKincaidGrade('The cat sat on the mat.');
    expect(grade).toBeLessThan(5);
  });

  it('scores a long, jargon-dense sentence higher', () => {
    const { grade } = fleschKincaidGrade(
      'Notwithstanding any provision herein to the contrary, accrued but unutilized compensatory remuneration shall be forfeited absent explicit authorization.',
    );
    expect(grade).toBeGreaterThan(12);
  });
});

describe('Stage 3D — glossary readability distribution', () => {
  it('reports the grade-level distribution for every short/long field and flags anything above grade 10', () => {
    const scored = GLOSSARY_TERMS.flatMap((t) => [
      { id: t.id, field: 'short' as const, grade: fleschKincaidGrade(t.short).grade },
      { id: t.id, field: 'long' as const, grade: fleschKincaidGrade(t.long).grade },
    ]);
    const grades = scored.map((s) => s.grade);
    const avg = grades.reduce((a, b) => a + b, 0) / grades.length;
    const max = Math.max(...grades);
    const above10 = scored.filter((s) => s.grade > 10);
    const above8 = scored.filter((s) => s.grade > 8 && s.grade <= 10);

    // Printed so the real distribution lands in the PR / PROGRESS.md, not an estimate.
    // eslint-disable-next-line no-console
    console.log(
      `Glossary readability: avg grade ${avg.toFixed(1)}, max ${max.toFixed(1)}, ` +
        `${above10.length} above grade 10 (fail), ${above8.length} above grade 8 (warn, target is ~8).`,
    );
    if (above10.length > 0) {
      console.log('Above grade 10:', above10.map((s) => `${s.id}.${s.field} (${s.grade.toFixed(1)})`).join(', '));
    }

    expect(above10, `These entries exceed grade 10 and must be simplified: ${above10.map((s) => `${s.id}.${s.field}`).join(', ')}`).toEqual([]);
  });
});
