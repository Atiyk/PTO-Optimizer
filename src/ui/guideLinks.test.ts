import { describe, expect, it } from 'vitest';
import { GUIDE_LINKS_2027, GUIDES_2027_HUB } from './guideLinkList';
import { GUIDES, GUIDE_HUB } from '../content/guides/guides2027';

describe('links into the 2027 guides', () => {
  it('lists every guide, in order, with its own nav label', () => {
    expect(GUIDE_LINKS_2027.map((l) => [l.href, l.label])).toEqual(GUIDES.map((g) => [g.path, g.navLabel]));
    expect(GUIDES_2027_HUB.href).toBe(GUIDE_HUB.path);
  });
});
