import { describe, expect, it } from 'vitest';
import { CHILDCARE_US_CA, CHILDCARE_US_NY, CHILDCARE_US_TX, CLINIC_TEMPLATE } from '../../rulepacks/childcare';
import { coverageForDay, credentialValid, demandFor, mergePacks, ratioRequirement, type CoverageDayInput } from './requiredStaff';
import { blocksForDay, leaveInterval, localInterval } from './timeBlocks';
import type { RulePack } from './types';

const LA = 'America/Los_Angeles';
const DATE = '2026-11-06'; // a Friday
const FRI = 4;

/** Every-day demand row helper (counts only). */
const row = (roomId: string, group: string, count: number, start = 420, end = 1080) => ({ roomId, weekday: FRI, startMinute: start, endMinute: end, group, count });
const shift = (memberId: string, roomId: string, start = 420, end = 1080) => ({ memberId, roomId, interval: localInterval(DATE, start, end, LA) });

function base(over: Partial<CoverageDayInput> = {}): CoverageDayInput {
  return {
    pack: CHILDCARE_US_CA,
    date: DATE,
    timezone: LA,
    rooms: [{ id: 'toddlers', name: 'Toddler room' }],
    demand: [row('toddlers', 'toddler', 12)],
    shifts: [shift('ana', 'toddlers'), shift('ben', 'toddlers')],
    absences: [],
    credentials: new Map(),
    ...over,
  };
}

const at = (day: ReturnType<typeof coverageForDay>, roomId: string, hhmm: string) => day.rooms.find((r) => r.roomId === roomId && r.block.key === `${DATE}T${hhmm}`)!;

describe('ratio requirement (COVERAGE-SPEC §3 hand-verified examples)', () => {
  it('1. CA toddler room: 12 toddlers at 1:6 need 2; Ben on leave 14:00–18:00 leaves a gap of 1 with the citation (RC2)', () => {
    const day = coverageForDay(
      base({ absences: [{ memberId: 'ben', status: 'approved', interval: leaveInterval(DATE, 'hours', LA, { startMinute: 840, endMinute: 1080 }) }] }),
    );
    const before = at(day, 'toddlers', '13:30');
    expect(before).toMatchObject({ children: 12, ratioRequired: 2, present: 2, gap: 0 });
    const during = at(day, 'toddlers', '14:00');
    expect(during).toMatchObject({ children: 12, governing: 'toddler', ratioRequired: 2, present: 1, gap: 1 });
    expect(during.notCounted).toEqual([{ memberId: 'ben', reason: 'on_leave' }]);
    const s = during.shortfalls[0]!;
    expect(s.kind).toBe('ratio');
    expect(s.provenance.citation?.section).toBe('§ 1596.955(a)(3)–(4)');
    const gaps = day.rooms.filter((r) => r.gap > 0).map((r) => r.block.startMinute);
    expect(gaps[0]).toBe(840);
    expect(gaps).toHaveLength(8); // 14:00–18:00 in 30-minute blocks
  });

  it('pending leave counts only in the "likely" view', () => {
    const abs = [{ memberId: 'ben', status: 'pending' as const, interval: leaveInterval(DATE, 'pm', LA) }];
    expect(at(coverageForDay(base({ absences: abs })), 'toddlers', '14:00').gap).toBe(0);
    expect(at(coverageForDay(base({ absences: abs, includePending: true })), 'toddlers', '14:00').gap).toBe(1);
  });

  it('2. NY mixed toddler + preschool at 07:00: youngest rule → 1:5 → 2 staff; group 10 ≤ 12', () => {
    const r = ratioRequirement(CHILDCARE_US_NY, { '18_36m': 4, '3y': 6 });
    expect(r).toMatchObject({ children: 10, governing: '18_36m', ratioRequired: 2, groupSizeViolations: [] });
    expect(r.rules[0]!.citation?.section).toBe('§ 418-1.8(k)(3)');
  });

  it('3. TX core child: 2 (18–23 m) + 5 (2 y) + 4 (3 y) → core 6th child is 2 y → 1:11 → 1 staff', () => {
    const r = ratioRequirement(CHILDCARE_US_TX, { '18_23m': 2, '2y': 5, '3y': 4 });
    expect(r).toMatchObject({ children: 11, governing: '2y', ratioRequired: 1 });
    // Shift the middle: 6 of the 11 are 18–23 months → that group governs → ceil(11/9) = 2.
    expect(ratioRequirement(CHILDCARE_US_TX, { '18_23m': 6, '3y': 5 })).toMatchObject({ governing: '18_23m', ratioRequired: 2 });
  });

  it('4. proportional (org choice): 3 infants (1:4) + 4 toddlers (1:6) → 1.4167 → 2', () => {
    const pack: RulePack = { ...CHILDCARE_US_CA, rules: CHILDCARE_US_CA.rules.map((r) => (r.kind === 'mixed_age' ? { ...r, method: 'proportional' as const, basis: 'org_policy' as const } : r)) as RulePack['rules'] };
    expect(ratioRequirement(pack, { infant: 3, toddler: 4 }).ratioRequired).toBe(2);
    // and youngest (the CA default) would need ceil(7/4) = 2 as well; 9 children → 3
    expect(ratioRequirement(CHILDCARE_US_CA, { infant: 3, toddler: 6 }).ratioRequired).toBe(3);
    expect(ratioRequirement(pack, { infant: 3, toddler: 6 }).ratioRequired).toBe(2);
  });

  it('majority method picks the bigger group, ties go to the younger', () => {
    const pack: RulePack = { ...CHILDCARE_US_NY, rules: CHILDCARE_US_NY.rules.map((r) => (r.kind === 'mixed_age' ? { ...r, method: 'majority' as const } : r)) as RulePack['rules'] };
    expect(ratioRequirement(pack, { '3y': 4, '4y': 10 }).governing).toBe('4y');
    expect(ratioRequirement(pack, { '3y': 5, '4y': 5 }).governing).toBe('3y');
  });

  it('group size over the maximum is flagged (staffing cannot fix it)', () => {
    const r = ratioRequirement(CHILDCARE_US_CA, { toddler: 13 });
    expect(r.ratioRequired).toBe(3);
    expect(r.groupSizeViolations).toHaveLength(1);
    const day = coverageForDay(base({ demand: [row('toddlers', 'toddler', 13)], shifts: [shift('a', 'toddlers'), shift('b', 'toddlers'), shift('c', 'toddlers')] }));
    expect(at(day, 'toddlers', '10:00').shortfalls.map((s) => s.kind)).toEqual(['group_size']);
    expect(at(day, 'toddlers', '10:00').gap).toBe(0);
  });

  it('no children → no requirement; groups with no ratio rule are reported, not guessed', () => {
    expect(ratioRequirement(CHILDCARE_US_CA, {}).ratioRequired).toBe(0);
    const r = ratioRequirement(CHILDCARE_US_CA, { martians: 3 });
    expect(r).toMatchObject({ ratioRequired: 0, unratedGroups: ['martians'] });
  });

  it('5. an expired credential stops a scheduled teacher counting from that date', () => {
    const pack = mergePacks([CHILDCARE_US_CA, { ageGroups: [], rules: [{ id: 'fq', label: 'Only fully qualified teachers count', kind: 'ratio_counts_credential', anyOf: ['fully_qualified_teacher'], basis: 'org_policy' }] }]);
    const creds = new Map([
      ['ana', [{ key: 'fully_qualified_teacher', expiresOn: '2027-01-01' }]],
      ['ben', [{ key: 'fully_qualified_teacher', expiresOn: DATE }]], // expires today → not valid today
    ]);
    const day = coverageForDay(base({ pack, credentials: creds }));
    const b = at(day, 'toddlers', '09:00');
    expect(b).toMatchObject({ present: 1, gap: 1 });
    expect(b.notCounted).toEqual([{ memberId: 'ben', reason: 'credential' }]);
    expect(credentialValid({ key: 'x', expiresOn: '2026-11-07' }, DATE)).toBe(true);
    expect(credentialValid({ key: 'x', issuedOn: '2026-11-07' }, DATE)).toBe(false);
  });

  it('6. site-level role rule: the only CPR holder on leave leaves a site gap while children are present', () => {
    const pack = mergePacks([CHILDCARE_US_CA, { ageGroups: [], rules: [{ id: 'cpr', label: 'One CPR-certified staff on site', kind: 'role_present', credential: 'cpr', min: 1, scope: 'site', when: 'children_present', basis: 'org_policy' }] }]);
    const input = base({
      pack,
      rooms: [{ id: 'toddlers', name: 'T' }, { id: 'pre', name: 'P' }],
      demand: [row('toddlers', 'toddler', 6), row('pre', 'preschool', 10)],
      shifts: [shift('ana', 'toddlers'), shift('cy', 'pre')],
      credentials: new Map([['cy', [{ key: 'cpr', expiresOn: '2027-06-01' }]]]),
    });
    expect(coverageForDay(input).site.find((s) => s.block.startMinute === 600)!.gap).toBe(0);
    const out = coverageForDay({ ...input, absences: [{ memberId: 'cy', status: 'approved', interval: leaveInterval(DATE, 'full', LA) }] });
    const site = out.site.find((s) => s.block.startMinute === 600)!;
    expect(site.gap).toBe(1);
    expect(site.shortfalls[0]).toMatchObject({ ruleId: 'cpr', kind: 'role_present', required: 1, present: 0 });
    // Before opening (no demand) the rule is inactive.
    expect(out.site.find((s) => s.block.startMinute === 360)!.gap).toBe(0);
  });

  it('room role rule counts anyone present with the credential, even if they do not count in ratio', () => {
    const pack = mergePacks([CHILDCARE_US_CA, { ageGroups: [], rules: [{ id: 'lead', label: 'A lead teacher in the room', kind: 'role_present', credential: 'lead', min: 1, scope: 'room', when: 'children_present', basis: 'org_policy' }] }]);
    const b = at(coverageForDay(base({ pack })), 'toddlers', '09:00');
    expect(b.shortfalls.map((s) => s.ruleId)).toEqual(['lead']);
    expect(b).toMatchObject({ required: 2, gap: 1 });
    const ok = at(coverageForDay(base({ pack, credentials: new Map([['ana', [{ key: 'lead' }]]]) })), 'toddlers', '09:00');
    expect(ok.gap).toBe(0);
  });

  it('a shift must cover the whole block to count; a night shift crossing midnight counts on both days', () => {
    const half = coverageForDay(base({ shifts: [shift('ana', 'toddlers'), shift('ben', 'toddlers', 420, 855)] }));
    expect(at(half, 'toddlers', '14:00').present).toBe(1); // ben leaves 14:15
    const nightPack = { ageGroups: CHILDCARE_US_CA.ageGroups, rules: CHILDCARE_US_CA.rules };
    const night = coverageForDay(base({ pack: nightPack, demand: [row('toddlers', 'toddler', 3, 0, 360)], shifts: [{ memberId: 'n', roomId: 'toddlers', interval: localInterval('2026-11-05', 1320, 360, LA) }] }));
    expect(at(night, 'toddlers', '02:00')).toMatchObject({ present: 1, gap: 0 });
  });
});

describe('demand (counts only)', () => {
  const b = (hhmm: string) => blocksForDay(DATE, LA).find((x) => x.key === `${DATE}T${hhmm}`)!;
  it('template rows add up per group; exceptions override a group for their window; closed zeroes the day', () => {
    const demand = [row('r', 'toddler', 5), row('r', 'toddler', 2, 900, 1080), row('r', 'preschool', 8)];
    expect(demandFor('r', b('09:00'), demand)).toEqual({ toddler: 5, preschool: 8 });
    expect(demandFor('r', b('15:00'), demand)).toEqual({ toddler: 7, preschool: 8 });
    const ex = [{ roomId: 'r', date: DATE, startMinute: 840, endMinute: 1080, group: 'toddler', count: 9 }];
    expect(demandFor('r', b('14:00'), demand, ex)).toEqual({ toddler: 9, preschool: 8 });
    expect(demandFor('r', b('13:30'), demand, ex)).toEqual({ toddler: 5, preschool: 8 });
    expect(demandFor('r', b('09:00'), demand, [{ roomId: 'r', date: DATE, closed: true }])).toEqual({});
    expect(demandFor('r', b('06:30'), demand)).toEqual({});
  });
});

describe('clinic pack runs on the same engine (RC12)', () => {
  it('a booked hygiene chair needs a licensed hygienist; an unlicensed assistant does not count; the dentist rule is site-wide', () => {
    const day = coverageForDay({
      pack: CLINIC_TEMPLATE,
      date: DATE,
      timezone: LA,
      rooms: [{ id: 'op1', name: 'Operatory 1' }, { id: 'op2', name: 'Operatory 2' }],
      demand: [row('op1', 'hygiene', 1, 480, 1020), row('op2', 'surgery', 1, 600, 720)],
      shifts: [shift('hy', 'op1', 480, 1020), shift('asst', 'op2', 480, 1020), shift('dds', 'op2', 480, 1020)],
      absences: [],
      credentials: new Map([
        ['hy', [{ key: 'rdh_licence', expiresOn: '2028-01-01' }]],
        ['dds', [{ key: 'dds_licence', expiresOn: '2028-01-01' }]],
      ]),
    });
    expect(at(day, 'op1', '09:00')).toMatchObject({ ratioRequired: 1, present: 1, gap: 0 });
    expect(at(day, 'op2', '10:00')).toMatchObject({ ratioRequired: 2, present: 1, gap: 1 });
    expect(at(day, 'op2', '10:00').notCounted).toEqual([{ memberId: 'asst', reason: 'credential' }]);
    expect(day.site.find((s) => s.block.startMinute === 600)!.gap).toBe(0);
  });
});
