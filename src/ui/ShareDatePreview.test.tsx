import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { availabilityHeading, ShareDatePreview } from './ShareDatePreview';
import { SHARE_LINK_SENTENCE } from './shareLinkCopy';
import { findBannedVocabulary } from '../content/vocabulary';

describe('ShareDatePreview copy (P2 task 4)', () => {
  it('writes the heading in sentence case instead of relying on a capitalize class', () => {
    expect(availabilityHeading('proposed', 11)).toBe('Proposed availability (11 dates)');
    expect(availabilityHeading('confirmed', 1)).toBe('Confirmed availability (1 date)');
    expect(availabilityHeading(undefined, 2)).toBe('Availability (2 dates)');
    const html = renderToStaticMarkup(<ShareDatePreview dates={['2027-01-04', '2027-01-05']} status="proposed" freeDays={null} expanded />);
    expect(html).toContain('Proposed availability (2 dates)');
    expect(html).not.toContain('capitalize');
  });

  it('says plainly what the date-only link leaves out', () => {
    const html = renderToStaticMarkup(<ShareDatePreview dates={['2027-01-04']} status="confirmed" freeDays={null} expanded />);
    expect(html).toContain('This doesn’t share which days are already off or their PTO costs.');
    expect(html).not.toContain('undisclosed');
  });
});

describe('SHARE_LINK_SENTENCE (N-P2-4)', () => {
  it('uses the same words as the /pto control, not "blackout dates"', () => {
    expect(SHARE_LINK_SENTENCE).toContain('days you can’t take off');
    expect(findBannedVocabulary(SHARE_LINK_SENTENCE)).toEqual([]);
  });
});
