import { describe, expect, it } from 'vitest';
import { safeNext } from './safeNext';

const base = 'https://teams.example.com';

describe('safeNext', () => {
  it('keeps same-site paths', () => {
    expect(safeNext('/app/requests?x=1', base)).toBe('/app/requests?x=1');
  });
  it.each([null, '', 'https://evil.com', '//evil.com', '/\\evil.com/x', '/\tevil', 'evil'])('rejects %j', (next) => {
    expect(safeNext(next, base)).toBeNull();
  });
});
