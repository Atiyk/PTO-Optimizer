import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PRACTICAL_GUIDES, findPracticalGuide } from './guides';
import { GLOSSARY_TERMS } from './terms';
import { GlossaryTermPage } from '../../ui/GlossaryTermPage';
import { Glossary } from '../../ui/Glossary';

describe('Practical PTO guides', () => {
  it('extends eight existing prerendered glossary routes, not invented links', () => {
    const ids = new Set(GLOSSARY_TERMS.map((term) => term.id));
    expect(PRACTICAL_GUIDES).toHaveLength(8);
    expect(new Set(PRACTICAL_GUIDES.map((guide) => guide.termId)).size).toBe(PRACTICAL_GUIDES.length);
    for (const guide of PRACTICAL_GUIDES) {
      expect(ids.has(guide.termId)).toBe(true);
      expect(findPracticalGuide(guide.termId)).toEqual(guide);
      expect(guide.action.href === '/pto' || guide.action.href === '/policy').toBe(true);
    }
  });

  it('provides a real explanation, worked example, risks and three HR questions for every guide', () => {
    for (const guide of PRACTICAL_GUIDES) {
      expect(guide.answer.length).toBeGreaterThan(55);
      expect(guide.steps.length).toBeGreaterThanOrEqual(3);
      expect(guide.example.setup.length).toBeGreaterThan(40);
      expect(guide.example.calculation.length).toBeGreaterThan(30);
      expect(guide.example.result.length).toBeGreaterThan(35);
      expect(guide.mistakes.length).toBeGreaterThanOrEqual(3);
      expect(guide.hrQuestions).toHaveLength(3);
      expect(guide.caveat.length).toBeGreaterThan(35);
    }
  });

  it('renders substantive guide content in server HTML for crawlers and non-JS readers', () => {
    for (const guide of PRACTICAL_GUIDES) {
      const html = renderToStaticMarkup(<GlossaryTermPage termId={guide.termId} />);
      expect(html).toContain(guide.title);
      expect(html).toContain(guide.example.calculation.replace(/&/g, '&amp;'));
      expect(html).toContain('Common mistakes');
      expect(html).toContain('Three questions for HR');
      expect(html).toContain(guide.action.label);
      expect(html).toContain('href="' + guide.action.href + '"');
    }
  });

  it('shows six editorial entry points in the Understand hub', () => {
    const html = renderToStaticMarkup(<Glossary />);
    expect(html).toContain('Practical guides');
    for (const id of ['pto', 'accrual', 'carryover', 'company-holiday', 'notice-period', 'payout']) {
      expect(html).toContain('href="/glossary/' + id + '"');
      expect(html).toContain(findPracticalGuide(id)!.title);
    }
  });

  it('does not assert a legal payout or forfeiture entitlement in its examples', () => {
    expect(findPracticalGuide('payout')?.caveat).toContain('No jurisdiction-specific payout right');
    expect(findPracticalGuide('carryover')?.caveat).toContain('Local employment law');
    expect(findPracticalGuide('pto-request')?.caveat).toContain('does not send requests');
  });
});
