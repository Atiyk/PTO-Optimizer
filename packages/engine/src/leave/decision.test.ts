import { describe, expect, it } from 'vitest';
import { addBusinessDays, decideRoute, possibleFmla, type ApprovalPolicy, type DecisionFacts } from './decision';
import { suggestAlternatives } from './alternatives';
import { allocateWindow, type WindowRequest } from './requestWindow';
import { evaluateLeaveRules, requiredNotice, validateLeaveRule, type LeaveRule, type RuleContext } from './rules';

const all = { leaveTypeKeys: [], locationIds: [], teamIds: [], groupIds: [] };
const subject = { memberId: 'me', startDate: '2025-01-01', locationId: 'L1', teamId: 'T1', groupIds: [] };
const ctx = (over: Partial<RuleContext> = {}): RuleContext => ({
  subject,
  leaveTypeKey: 'vacation',
  start: '2026-11-09',
  end: '2026-11-13',
  chargedDates: ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'],
  others: [],
  today: '2026-11-02',
  ...over,
});

describe('new rule kinds', () => {
  const notice: LeaveRule = { ...all, id: 'n', name: 'Notice', hard: false, kind: 'min_notice', tiers: [{ minDays: 1, noticeDays: 3 }, { minDays: 5, noticeDays: 14 }] };
  it('min_notice picks the longest matching tier', () => {
    expect(requiredNotice(notice.kind === 'min_notice' ? notice.tiers : [], 1)).toBe(3);
    expect(requiredNotice(notice.kind === 'min_notice' ? notice.tiers : [], 5)).toBe(14);
    const r = evaluateLeaveRules([notice], ctx());
    expect(r.warnings[0]!.message).toBe("Notice: 5 working days need 14 days' notice; this gives 7.");
    const one = evaluateLeaveRules([notice], ctx({ start: '2026-11-05', end: '2026-11-05', chargedDates: ['2026-11-05'] }));
    expect(one.warnings).toEqual([]); // 3 days' notice exactly
    expect(evaluateLeaveRules([notice], ctx({ today: undefined })).warnings).toEqual([]);
  });

  it('max_consecutive counts working days', () => {
    const r: LeaveRule = { ...all, id: 'c', name: 'Two weeks max', hard: true, kind: 'max_consecutive', maxDays: 4 };
    expect(evaluateLeaveRules([r], ctx()).problems[0]!.message).toMatch(/at most 4 working days in one request; this is 5/);
    expect(evaluateLeaveRules([{ ...r, maxDays: 5 }], ctx()).problems).toEqual([]);
  });

  it('request_window is always soft and stops applying after collect_until', () => {
    const w: LeaveRule = { ...all, id: 'w', name: 'Holidays', hard: true, kind: 'request_window', start: '2026-11-09', end: '2026-11-20', collectUntil: '2026-11-04', slots: 1, tieBreak: 'rotation' };
    const r = evaluateLeaveRules([w], ctx());
    expect(r.problems).toEqual([]);
    expect(r.warnings[0]!.message).toMatch(/collected until 2026-11-04/);
    expect(evaluateLeaveRules([w], ctx({ today: '2026-11-05' })).warnings).toEqual([]);
  });

  it('health-related and protected leave is exempt from every rule', () => {
    const bl: LeaveRule = { ...all, id: 'b', name: 'Freeze', hard: true, kind: 'blackout', start: '2026-11-01', end: '2026-11-30' };
    expect(evaluateLeaveRules([bl], ctx()).problems).toHaveLength(1);
    expect(evaluateLeaveRules([bl], ctx({ exempt: true }))).toEqual({ problems: [], warnings: [] });
  });

  it('validates the new kinds', () => {
    expect(validateLeaveRule({ ...all, id: 'x', name: 'N', hard: true, kind: 'min_notice', tiers: [] })).toContain('Give 1 to 10 notice tiers.');
    expect(validateLeaveRule({ ...all, id: 'x', name: 'C', hard: true, kind: 'max_consecutive', maxDays: 0 })).toHaveLength(1);
    expect(validateLeaveRule({ ...all, id: 'x', name: 'W', hard: false, kind: 'request_window', start: '2026-12-22', end: '2026-12-31', collectUntil: '2026-12-23', slots: 2, tieBreak: 'lottery' })).toContain(
      'Collect requests until a date before the period starts.',
    );
  });
});

const facts = (over: Partial<DecisionFacts> = {}): DecisionFacts => ({
  leaveTypeName: 'Vacation',
  unit: 'days',
  amount: 2,
  workingDays: 2,
  countsAgainstBalance: true,
  balanceAfter: 8,
  requiresApproval: true,
  healthRelated: false,
  protectedCategory: 'none',
  retroactive: false,
  findings: [],
  overtimeBand: null,
  ...over,
});
const policy = (over: Partial<ApprovalPolicy> = {}): ApprovalPolicy => ({
  id: 'p1',
  name: 'Front desk',
  mode: 'auto',
  maxDays: 3,
  minNoticeDays: 7,
  toleratedWarnings: [],
  requiresTypeOptIn: false,
  typeOptedIn: false,
  ...over,
});

describe('decideRoute', () => {
  it('auto-approves a clean request in auto mode, with a checklist and an audit basis', () => {
    const d = decideRoute(facts(), policy(), 10);
    expect(d.route).toBe('auto_approve');
    expect(d.wouldAutoApprove).toBe(true);
    expect(d.checklist.every((c) => c.status === 'pass')).toBe(true);
    expect(d.basis).toBe('Vacation, 2 days (limit 3), balance after 8, no coverage gap, no blackout, policy "Front desk"');
  });

  it('shadow, suggest and off never act, but say whether they would', () => {
    for (const mode of ['shadow', 'suggest', 'off'] as const) {
      const d = decideRoute(facts(), policy({ mode }), 10);
      expect(d.route).toBe('needs_person');
      expect(d.wouldAutoApprove).toBe(true);
      expect(d.recommendation).toBe('approve');
    }
  });

  it('a soft warning blocks auto-approval unless the policy tolerates that kind (the #66 bug)', () => {
    const warn = { kind: 'max_out' as const, severity: 'warn' as const, message: 'Front: 3 people would be away; the limit is 2.' };
    const d = decideRoute(facts({ findings: [warn] }), policy(), 10);
    expect(d.route).toBe('needs_person');
    expect(d.blockers).toEqual([warn.message]);
    expect(d.recommendation).toBe('likely_decline');
    expect(decideRoute(facts({ findings: [warn] }), policy({ toleratedWarnings: ['max_out'] }), 10).route).toBe('auto_approve');
    const ev = { kind: 'event' as const, severity: 'warn' as const, message: 'Overlaps a team event.' };
    expect(decideRoute(facts({ findings: [ev] }), policy(), 10).recommendation).toBe('look');
  });

  it('enforces the policy limits: size and notice', () => {
    expect(decideRoute(facts({ amount: 4 }), policy(), 10).blockers).toEqual(['Longer than the 3 days auto-approval limit.']);
    expect(decideRoute(facts(), policy(), 6).blockers).toEqual(["Less than the 7 days' notice auto-approval needs."]);
  });

  it('a request window always needs a person, even when tolerated warnings are broad', () => {
    const w = { kind: 'request_window' as const, severity: 'warn' as const, message: 'collected until …' };
    expect(decideRoute(facts({ findings: [w] }), policy({ toleratedWarnings: ['request_window' as never] }), 10).route).toBe('needs_person');
  });

  it('blocked by hard facts; recorded for protected leave; no approval when the type needs none', () => {
    expect(decideRoute(facts({ findings: [{ kind: 'balance', severity: 'fail', message: 'Not enough balance', fix: 'Ask for 1 day less' }] }), policy(), 10)).toMatchObject({
      route: 'blocked',
      checklist: expect.arrayContaining([{ kind: 'balance', status: 'fail', message: 'Not enough balance', fix: 'Ask for 1 day less' }]),
    });
    expect(decideRoute(facts({ protectedCategory: 'jury' }), policy(), 10).route).toBe('recorded_protected');
    expect(decideRoute(facts({ requiresApproval: false, healthRelated: true }), policy(), 0).route).toBe('no_approval_needed');
  });

  it('health-related leave is never held back by coverage, blackouts or notice', () => {
    const f = facts({ healthRelated: true, countsAgainstBalance: false, findings: [{ kind: 'coverage', severity: 'warn', message: 'short' }] });
    const d = decideRoute(f, policy({ minNoticeDays: null }), 0);
    expect(d.route).toBe('auto_approve');
    expect(d.recommendation).toBe('approve');
  });

  it('never returns a decline, for any combination', () => {
    const kinds = ['coverage', 'blackout', 'max_out', 'event', 'regulated', 'overtime', 'notice'] as const;
    for (const k of kinds)
      for (const sev of ['warn', 'fail'] as const)
        for (const mode of ['off', 'shadow', 'suggest', 'auto'] as const) {
          const d = decideRoute(facts({ findings: [{ kind: k, severity: sev, message: k }] }), policy({ mode }), 1);
          expect(['blocked', 'no_approval_needed', 'recorded_protected', 'auto_approve', 'needs_person']).toContain(d.route);
          expect(JSON.stringify(d)).not.toMatch(/"route":"(decline|declined|reject)/);
        }
  });

  it('overtime band shows in the checklist and blocks auto-approval', () => {
    const d = decideRoute(facts({ overtimeBand: 'overtime' }), policy(), 10);
    expect(d.checklist).toContainEqual({ kind: 'overtime', status: 'warn', message: 'Cover would mean overtime for someone.' });
    expect(d.route).toBe('needs_person');
  });
});

describe('possible FMLA flag', () => {
  it('flags health absences over three calendar days and fmla_possible types; due in 5 business days', () => {
    expect(possibleFmla({ healthRelated: true, protectedCategory: 'none', calendarDays: 3 })).toBe(false);
    expect(possibleFmla({ healthRelated: true, protectedCategory: 'none', calendarDays: 4 })).toBe(true);
    expect(possibleFmla({ healthRelated: false, protectedCategory: 'fmla_possible', calendarDays: 1 })).toBe(true);
    expect(addBusinessDays('2026-10-30', 5)).toBe('2026-11-06'); // Fri → next Fri
    expect(addBusinessDays('2026-10-30', 5, new Set(['2026-11-03']))).toBe('2026-11-09');
  });
});

describe('suggestAlternatives', () => {
  const workWeek = [true, true, true, true, true, false, false];
  it('keeps the length, skips hard fails, prefers auto-approvable, then fewer warnings, then the bridge', () => {
    const blocked = new Set(['2026-12-21', '2026-12-22', '2026-12-23']);
    const res = suggestAlternatives({
      start: '2026-12-21',
      end: '2026-12-23',
      today: '2026-11-01',
      workWeek,
      holidays: new Set(['2026-12-25']),
      check: ({ dates }) => ({ hardFails: dates.some((d) => blocked.has(d)) ? 1 : 0, warnings: dates.includes('2026-12-28') ? 1 : 0, wouldAutoApprove: !dates.includes('2026-12-30') }),
    });
    expect(res).toHaveLength(3);
    for (const a of res) expect(a.workingDays).toBe(3);
    expect(res.every((a) => a.wouldAutoApprove && a.warnings === 0)).toBe(true);
    // Thu 24 → Tue 29 isn't allowed (28 warns), the bridge over the Christmas holiday wins on days away.
    expect(res[0]!.daysAway).toBeGreaterThanOrEqual(res[1]!.daysAway);
  });

  it('never suggests past dates and returns nothing when nothing passes', () => {
    const res = suggestAlternatives({ start: '2026-11-04', end: '2026-11-04', today: '2026-11-03', workWeek, holidays: new Set(), check: () => ({ hardFails: 0, warnings: 0, wouldAutoApprove: true }) });
    expect(res.every((a) => a.start > '2026-11-03')).toBe(true);
    expect(suggestAlternatives({ start: '2026-11-04', end: '2026-11-04', today: '2026-11-01', workWeek, holidays: new Set(), check: () => ({ hardFails: 1, warnings: 0, wouldAutoApprove: false }) })).toEqual([]);
  });

  it('is fast: 50 people, 8 weeks, under 200 ms', () => {
    const others = Array.from({ length: 50 }, (_, i) => ({ id: `m${i}`, dates: new Set([`2026-12-${String(10 + (i % 15)).padStart(2, '0')}`]) }));
    const t0 = performance.now();
    suggestAlternatives({
      start: '2026-12-14',
      end: '2026-12-18',
      today: '2026-11-01',
      workWeek,
      holidays: new Set(),
      check: ({ dates }) => {
        let max = 0;
        for (const d of dates) max = Math.max(max, others.filter((o) => o.dates.has(d)).length);
        return { hardFails: 0, warnings: max > 3 ? 1 : 0, wouldAutoApprove: max <= 3 };
      },
    });
    expect(performance.now() - t0).toBeLessThan(200);
  });
});

describe('allocateWindow', () => {
  const req = (id: string, last: number | null, start: string, at: string, dates = ['2026-12-28', '2026-12-29']): WindowRequest => ({
    requestId: id,
    memberId: `m-${id}`,
    dates,
    submittedAt: at,
    lastYearInPeriod: last,
    startDate: start,
  });
  const reqs = [req('a', 2025, '2020-01-01', '2026-11-01'), req('b', null, '2024-01-01', '2026-11-02'), req('c', 2023, '2022-01-01', '2026-11-03'), req('d', null, '2019-01-01', '2026-11-04', ['2026-12-31'])];

  it('rotation: never had it first, then longest ago; respects slots per day', () => {
    const a = allocateWindow(reqs, 2, 'rotation');
    expect(a.order).toEqual(['b', 'd', 'c', 'a']);
    expect(a.results.filter((r) => r.in).map((r) => r.requestId)).toEqual(['b', 'd', 'c']);
    expect(a.results.find((r) => r.requestId === 'a')!.reason).toMatch(/already has 2 of 2/);
  });

  it('seniority: earliest start date first', () => {
    expect(allocateWindow(reqs, 1, 'seniority').order).toEqual(['d', 'a', 'c', 'b']);
  });

  it('lottery: the same seed gives the same order, and the seed is kept', () => {
    const x = allocateWindow(reqs, 1, 'lottery', 42);
    expect(allocateWindow(reqs, 1, 'lottery', 42).order).toEqual(x.order);
    expect(x.seed).toBe(42);
    expect(new Set(x.order)).toEqual(new Set(['a', 'b', 'c', 'd']));
  });
});
