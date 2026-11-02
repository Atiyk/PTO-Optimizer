import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { rangeISO } from './dateUtils';
import { solve } from './solve';
import type { SolveInput } from './types';

// Full-result fingerprints captured from the pre-optimization implementation. These
// include alternatives, tags and tie-breaking, rather than checking totals alone.
const LEGACY_RESULTS = [
  '7c3557cba254b22085d55c0c17e1091d738696a78f88cb80f8ca146d3f0f993c',
  'b855710a2699367b20faac4bf9e152da7cc60e921fe4a9ae8668fd95bef0df6c',
  '4d2dcb530f94430af68f37460735ac5c2086a0ed8db296f77fc9a2a1f6a8935f',
  '6f1cc0f1c2c7e62fcdb1ad5d56a765c4179db86a5155555d505a8ca0f63bbab4',
  '701ba9f86e72f8d54d6ab6b1afaf18a2c609ce8a718c55a610a14bf1ece82159',
  '80ff589a387fc0f9b11ae7c43700f5a8e934f23c4e2c3304934b23d7608de050',
  '4dafe8a9159370153a31c9c622ae50c74533e4fb17f162507ddd63ce82577238',
  '3b2d9e4d1133bfa050d238edbe14e7b2f3568811c6de3dc38e7c746764cafb16',
  '9277c1513b499e901161d7d9f5246a5119c13b1b2a498f6a09b5c1556c092c95',
  '722c8039f840d44c73048b6ef09a51f21c5c32026b8487b9de704e8f2b236973',
  '98ea019a748c6579e153a0e7dee0b44f540667f69a3ac3ac53534049aff48bc4',
  'dd5dac84d83602b40b6c580f447a98a51540192e48929144dc32106833b4e785',
  'f5c5727b0b3e92c5becf6b119628731bb2335ad2745b505a26ebbcf898fe4055',
  '47441bd50bae17501f72878ca339ba9c0b4d13fa0c7300cb8a65a80c75ff0bc4',
  'ca54ebd7f52d3414fa5691e6dfeec21dc7745494db4cf3d1153644f06c165615',
  '310a26e8fa279a156cccea98669a229a599e714173454f82b363ade744b6953b',
  'a27c6ae6bf874a3819fd754c54272c12f89a6d959e44b2b7a5f3819d368abef9',
  'b4aa8e369677698362291136d7ba21ba0d033231b7ca03093cc81159869cd493',
  '606c2b78749f663da119a06c8b8ee2b61b9370bb2116a937623dd6edc9569693',
  'd5e6fec008f714f71b6577fe33bd516a5a4a81b762387dd7c6ca92d3aff69884',
  '5651833dbc61e0e1dedd3dc1c96947b71fad47acde5d4ecbc6fb6e080c7231f7',
  '0049ffa54adcde021f64c796af0201f7f6b5c4a1e7650b63b1767394c148b1f3',
  '249a6e9a18f62e0475602231a766410b36f77d76b4db6f5814f3ba3154980edf',
  'f4b2802bf805b07721dbb05d5f34b43f62276f187ec5d66459da94467886d69f',
];

describe('DP performance optimizations preserve legacy plans', () => {
  it('keeps complete results byte-identical across deterministic varied inputs', () => {
    for (let seed = 0; seed < LEGACY_RESULTS.length; seed++) {
      const input: SolveInput = {
        offDays: ['2028-02-14', '2028-02-21'],
        rangeStart: '2028-02-01', rangeEnd: '2028-03-15', budget: seed % 7 + 1,
        w: seed % 11 * 10, breakCount: seed % 8, country: seed % 2 ? 'US' : 'GB',
        blackouts: seed % 5 === 0 ? ['2028-02-11'] : [],
        workWeek: seed % 4 === 0 ? [true, true, true, true, false, false, false] : undefined,
        accrualPerMonth: seed % 6 === 0 ? 3 : undefined,
        expiryDate: seed % 7 === 0 ? '2028-02-29' : undefined,
        carryoverCap: seed % 7 === 0 ? 1 : undefined,
        mustIncludeDays: seed % 9 === 0 ? ['2028-02-09'] : [],
      };
      const fingerprint = createHash('sha256').update(JSON.stringify(solve(input))).digest('hex');
      expect(fingerprint, `legacy fixture ${seed}`).toBe(LEGACY_RESULTS[seed]);
    }
  });

  it('still maximizes spend after determining the maximum feasible count', () => {
    // Four days accrue on Sunday Feb 1. Only one separate break is possible, but
    // it can use all four PTO days. Finding the count using cost-1 suffixes must
    // not incorrectly restrict the final value DP to cost-1 candidates.
    const result = solve({
      offDays: [], rangeStart: '2026-01-01', rangeEnd: '2026-02-01',
      budget: 4, accrualPerMonth: 4, breakCount: 7, w: 0,
      blackouts: rangeISO('2026-01-01', '2026-01-26'),
    });
    expect(result.breakCountActual).toBe(1);
    expect(result.budgetSpent).toBe(4);
    expect(result.primary[0].start).toBe('2026-01-27');
    expect(result.primary[0].end).toBe('2026-02-01');
  });
});
