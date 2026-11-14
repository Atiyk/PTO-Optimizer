import { describe, expect, it } from 'vitest';
import { familyStateWords } from './FamilyCalendar';

describe('familyStateWords (N-P2-5)', () => {
  it('says "your PTO" on the person\'s own plan and "example PTO" on the example', () => {
    expect(familyStateWords('pto')).toBe('school is off, your PTO: a day with your kids');
    expect(familyStateWords('pto', true)).toBe('school is off, example PTO: a day with the kids');
    expect(familyStateWords('uncovered', true)).toBe(familyStateWords('uncovered'));
  });
});
