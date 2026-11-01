import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { coverageForDay, rankCandidates, rulesOf } from '@daysoff/engine/coverage/index';
import { CHILDCARE_US_CA } from '@daysoff/engine/rulepacks';
import { EXAMPLE_PACK, buildCallOffSteps, buildHeroExample, exampleCandidates, exampleDayInput } from './heroExample';
import { childcarePacks } from './rulesExample';

/*
 * The landing-page hero must show the engine's numbers, not hand-written ones: every count
 * in the grid, the rule and its citation, and the cover ranking are checked against direct
 * engine calls on the same example.
 */

const hero = buildHeroExample();

describe('hero coverage example', () => {
  it('every grid cell equals the engine (required, and staff counted before and after the call-off)', () => {
    const before = coverageForDay(exampleDayInput(false));
    const after = coverageForDay(exampleDayInput(true));
    let cells = 0;
    for (const room of hero.rooms) {
      for (const c of room.cells) {
        const a = after.rooms.find((r) => r.roomId === room.id && r.block.fold === 0 && r.block.startMinute === c.minute)!;
        const b = before.rooms.find((r) => r.roomId === room.id && r.block.fold === 0 && r.block.startMinute === c.minute)!;
        expect(c.required).toBe(a.required);
        expect(c.after).toBe(a.present);
        expect(c.before).toBe(b.present);
        cells++;
      }
    }
    // 3 rooms × 12 half hours (07:00–13:00).
    expect(cells).toBe(36);
  });

  it('before the call-off every room is in ratio; after it only Toddlers 09:00–11:30 is short', () => {
    for (const room of hero.rooms) for (const c of room.cells) expect(c.before).toBeGreaterThanOrEqual(c.required);
    const short = hero.rooms.flatMap((r) => r.cells.filter((c) => c.after < c.required).map((c) => `${r.id} ${c.time}`));
    expect(short).toEqual(['toddlers 09:00', 'toddlers 09:30', 'toddlers 10:00', 'toddlers 10:30', 'toddlers 11:00']);
    expect(hero.gap).toMatchObject({ roomName: 'Toddlers', from: '09:00', to: '11:30', required: 2, present: 1, children: 12 });
  });

  it('quotes the real CA rule pack rule and citation (hand check: ceil(12 / 6) = 2)', () => {
    const rule = rulesOf(CHILDCARE_US_CA, 'ratio').find((r) => r.ageGroup === 'toddler')!;
    expect(hero.gap.rule).toBe(rule.label);
    expect(hero.gap.childrenPerStaff).toBe(rule.childrenPerStaff);
    expect(Math.ceil(hero.gap.children / rule.childrenPerStaff)).toBe(hero.gap.required);
    expect(hero.gap.source).toMatchObject({
      regulation: rule.citation!.regulation,
      section: rule.citation!.section,
      url: rule.citation!.url,
      retrievedOn: rule.citation!.retrievedOn,
      quote: rule.citation!.quote,
    });
    expect(hero.gap.source.label).toBe('Cal. H&S Code § 1596.955(a)(3)–(4)');
  });

  it('the cover options are the engine ranking, in order, with the first skipped person and why', () => {
    const after = coverageForDay(exampleDayInput(true));
    const gapBlocks = after.rooms.filter((r) => r.gap > 0);
    const ranked = rankCandidates(
      {
        siteId: 'example',
        roomId: 'toddlers',
        date: '2026-11-12',
        interval: { start: gapBlocks[0]!.block.utcStart, end: gapBlocks.at(-1)!.block.utcEnd },
        credentials: rulesOf(EXAMPLE_PACK, 'ratio_counts_credential').map((r) => ({ anyOf: r.anyOf, ruleId: r.id, provenance: r })),
        absentMemberId: 'maya',
      },
      exampleCandidates(),
      { pack: EXAMPLE_PACK, costAware: false, overtimePolicy: 'avoid' },
    );
    const top = ranked.filter((c) => c.eligible).slice(0, 3);
    expect(hero.options.map((o) => o.name.toLowerCase())).toEqual(top.map((c) => c.memberId));
    expect(hero.options.map((o) => o.rank)).toEqual([1, 2, 3]);
    expect(top.every((c) => c.costBand === 'regular')).toBe(true);
    // Hand check of the score (COVERAGE-SPEC §4): Priya opted in with no covers (−40),
    // Jordan 1 cover (100), Sam opted in with 2 covers (200 − 40 = 160).
    expect(top.map((c) => c.score)).toEqual([-40, 100, 160]);
    expect(hero.options[0]!.reason).toBe('Qualified, 17.5 h this week with the cover, regular time; no covers in the last 90 days');
    const lee = ranked.find((c) => c.memberId === 'lee')!;
    expect(lee.excludedBy).toBe('credential_valid');
    expect(hero.skipped).toEqual({ name: 'Lee', reason: 'Teacher permit expired on 2026-10-31' });
    expect(hero.busy).toBe(5);
  });

  it('the client grid writes no ratio or count of its own', () => {
    const src = readFileSync(new URL('./HeroCoverageGrid.tsx', import.meta.url), 'utf8');
    expect(src).not.toMatch(/per \d|1:\d|\d+ (?:toddlers|children|teachers)/i);
  });
});

describe('call-off step-through (section 2)', () => {
  const steps = buildCallOffSteps();

  it('shows the hero’s own cells around the gap, and the accepted cover is the top-ranked person', () => {
    expect(steps.accepted.name).toBe(hero.options[0]!.name);
    for (const room of steps.rooms) {
      const heroRoom = hero.rooms.find((r) => r.id === room.id)!;
      for (const c of room.cells) {
        const h = heroRoom.cells.find((x) => x.minute === c.minute)!;
        expect([c.required, c.before, c.after]).toEqual([h.required, h.before, h.after]);
      }
    }
    // The gap's blocks are all inside the window, with an hour either side.
    const gapRoom = steps.rooms.find((r) => r.id === hero.gap.roomId)!;
    expect(gapRoom.cells.filter((c) => c.after < c.required)).toHaveLength(5);
    expect(gapRoom.cells[0]!.time).toBe('08:00');
  });

  it('after the cover is accepted the engine puts every block back in ratio, changing only the gap room', () => {
    for (const room of steps.rooms) {
      for (const c of room.cells) {
        expect(c.filled).toBeGreaterThanOrEqual(c.required);
        if (room.id !== hero.gap.roomId) expect(c.filled).toBe(c.after);
      }
    }
    const gapRoom = steps.rooms.find((r) => r.id === hero.gap.roomId)!;
    for (const c of gapRoom.cells.filter((x) => x.after < x.required)) expect(c.filled).toBe(c.after + 1);
  });
});

describe('marketing rules (compliance section, /childcare)', () => {
  it('are the CA, TX and NY packs’ own ratio rules and citations', () => {
    const packs = childcarePacks();
    expect(packs.map((p) => p.state)).toEqual(['California', 'Texas', 'New York']);
    const ca = packs[0]!;
    const caRatios = rulesOf(CHILDCARE_US_CA, 'ratio');
    expect(ca.ratios.map((r) => r.label)).toEqual(caRatios.map((r) => r.label));
    for (const [i, r] of ca.ratios.entries()) {
      expect(r.source?.url).toBe(caRatios[i]!.citation?.url);
      expect(r.source?.retrievedOn).toBe(caRatios[i]!.citation?.retrievedOn);
    }
    for (const p of packs) for (const r of p.ratios) expect(r.source || r.needsVerification).toBeTruthy();
  });
});
