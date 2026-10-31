import { describe, expect, it } from 'vitest';
import { absenceReport, HEALTH_BUCKET, type ReportAbsence } from './report';
import { dateOption, suggestEventDates, type EventAttendee } from './events';
import { evaluateLeaveRules, inScope, validateLeaveRule, type LeaveRule, type OtherAbsence, type RuleContext } from './rules';

const all = { leaveTypeKeys: [], locationIds: [], teamIds: [], groupIds: [] };
const subject = { memberId: 'me', startDate: '2026-09-01', locationId: 'L1', teamId: 'T1', groupIds: ['G1'] };
const ctx = (over: Partial<RuleContext> = {}): RuleContext => ({
  subject,
  leaveTypeKey: 'vacation',
  start: '2026-12-21',
  end: '2026-12-23',
  chargedDates: ['2026-12-21', '2026-12-22', '2026-12-23'],
  others: [],
  ...over,
});

describe('evaluateLeaveRules', () => {
  it('blackout: hard blocks, soft warns, and names the rule and first date', () => {
    const hard: LeaveRule = { ...all, id: 'b1', name: 'Holiday rush', hard: true, kind: 'blackout', start: '2026-12-22', end: '2026-12-31' };
    const r = evaluateLeaveRules([hard], ctx());
    expect(r.problems).toEqual([expect.objectContaining({ ruleId: 'b1', date: '2026-12-22', message: 'Holiday rush: no leave from 2026-12-22 to 2026-12-31.' })]);
    const soft = evaluateLeaveRules([{ ...hard, hard: false }], ctx());
    expect(soft.problems).toEqual([]);
    expect(soft.warnings).toHaveLength(1);
    expect(evaluateLeaveRules([hard], ctx({ start: '2026-12-01', end: '2026-12-02' })).problems).toEqual([]);
  });

  it('scopes by leave type, location, team and group', () => {
    const base: LeaveRule = { ...all, id: 'b', name: 'B', hard: true, kind: 'blackout', start: '2026-12-01', end: '2026-12-31' };
    expect(evaluateLeaveRules([{ ...base, leaveTypeKeys: ['sick'] }], ctx()).problems).toEqual([]);
    expect(evaluateLeaveRules([{ ...base, leaveTypeKeys: ['vacation'] }], ctx()).problems).toHaveLength(1);
    expect(evaluateLeaveRules([{ ...base, locationIds: ['L2'] }], ctx()).problems).toEqual([]);
    expect(evaluateLeaveRules([{ ...base, teamIds: ['T1', 'T2'] }], ctx()).problems).toHaveLength(1);
    expect(evaluateLeaveRules([{ ...base, groupIds: ['G9'] }], ctx()).problems).toEqual([]);
    expect(evaluateLeaveRules([{ ...base, groupIds: ['G1'] }], ctx()).problems).toHaveLength(1);
    expect(inScope({ ...all, locationIds: ['L1'] }, { locationId: null, teamId: null, groupIds: [] })).toBe(false);
  });

  it('probation: blocks until N days after the start date, inclusive boundary', () => {
    const p: LeaveRule = { ...all, id: 'p', name: 'Probation', hard: true, kind: 'probation', minDays: 90 };
    // 2026-09-01 + 90 days = 2026-11-30
    expect(evaluateLeaveRules([p], ctx({ start: '2026-11-29', end: '2026-11-29', chargedDates: ['2026-11-29'] })).problems[0]!.message).toBe(
      'Probation: this leave can be taken from 2026-11-30 (90 days after the start date).',
    );
    expect(evaluateLeaveRules([p], ctx({ start: '2026-11-30', end: '2026-11-30', chargedDates: ['2026-11-30'] })).problems).toEqual([]);
    expect(evaluateLeaveRules([p], ctx({ subject: { ...subject, startDate: null } })).problems).toEqual([]);
  });

  it('max_out: counts distinct other people in scope per day, plus this request', () => {
    const m: LeaveRule = { ...all, id: 'm', name: 'Front desk cover', hard: false, kind: 'max_out', maxOut: 2, locationIds: ['L1'] };
    const other = (id: string, dates: string[], locationId = 'L1'): OtherAbsence => ({ memberId: id, leaveTypeKey: 'vacation', locationId, teamId: 'T1', groupIds: [], dates });
    // One other person away on the 22nd: 2 total, at the limit, fine.
    expect(evaluateLeaveRules([m], ctx({ others: [other('a', ['2026-12-22'])] })).warnings).toEqual([]);
    // Two others on the 22nd (one with two requests counts once): 3 > 2.
    const r = evaluateLeaveRules([m], ctx({ others: [other('a', ['2026-12-22']), other('a', ['2026-12-22']), other('b', ['2026-12-22', '2026-12-23'])] }));
    expect(r.warnings).toEqual([expect.objectContaining({ date: '2026-12-22', message: 'Front desk cover: on 2026-12-22 3 people would be away; the limit is 2.' })]);
    // People at another site and the subject's own requests don't count.
    expect(evaluateLeaveRules([m], ctx({ others: [other('a', ['2026-12-22'], 'L2'), other('b', ['2026-12-22'], 'L2'), other('me', ['2026-12-22'])] })).warnings).toEqual([]);
    // Subject outside the scope: rule doesn't apply.
    expect(evaluateLeaveRules([m], ctx({ subject: { ...subject, locationId: 'L2' }, others: [other('a', ['2026-12-22']), other('b', ['2026-12-22'])] })).warnings).toEqual([]);
  });

  it('validates rule numbers', () => {
    expect(validateLeaveRule({ ...all, id: 'x', name: 'x', hard: true, kind: 'max_out', maxOut: 0 })).toHaveLength(1);
    expect(validateLeaveRule({ ...all, id: 'x', name: 'x', hard: true, kind: 'probation', minDays: 2.5 })).toHaveLength(1);
    expect(validateLeaveRule({ ...all, id: 'x', name: 'x', hard: true, kind: 'blackout', start: '2026-02-02', end: '2026-02-01' })).toHaveLength(1);
    expect(validateLeaveRule({ ...all, id: 'x', name: ' ', hard: true, kind: 'probation', minDays: 30 })).toHaveLength(1);
    expect(validateLeaveRule({ ...all, id: 'x', name: 'ok', hard: true, kind: 'probation', minDays: 30 })).toEqual([]);
  });
});

describe('suggestEventDates', () => {
  const a = (id: string, outDates: string[] = [], workWeek = '1111100', holidays: string[] = []): EventAttendee => ({ id, workWeek, outDates, holidays });

  it('ranks by fewest people out, then earliest, and skips weekends by default', () => {
    // Mon 2026-11-02 .. Sun 2026-11-08
    const people = [a('x', ['2026-11-02', '2026-11-03']), a('y', ['2026-11-02']), a('z', [], '1110000')];
    const s = suggestEventDates(people, '2026-11-02', '2026-11-08', { limit: 7 });
    expect(s.map((d) => d.date)).toEqual(['2026-11-04', '2026-11-03', '2026-11-05', '2026-11-06', '2026-11-02']);
    expect(s[0]).toMatchObject({ available: 3, out: 0 });
    expect(s.at(-1)).toMatchObject({ out: 2, reasons: { leave: 2, notWorking: 0, holiday: 0 } });
    expect(suggestEventDates(people, '2026-11-07', '2026-11-08', { includeWeekends: true })).toHaveLength(2);
  });

  it('counts holidays and non-working days with reasons', () => {
    expect(dateOption([a('x', [], '1111100', ['2026-11-26']), a('y', [], '1110111')], '2026-11-26')).toMatchObject({
      out: 2,
      reasons: { leave: 0, notWorking: 1, holiday: 1 },
      outIds: ['x', 'y'],
    });
    expect(suggestEventDates([], '2026-11-05', '2026-11-01')).toEqual([]);
  });
});

describe('absenceReport', () => {
  const abs = (over: Partial<ReportAbsence>): ReportAbsence => ({
    memberId: 'm1',
    teamId: 'T1',
    groupIds: [],
    leaveTypeName: 'Vacation',
    isHealthRelated: false,
    status: 'approved',
    chargedDates: ['2026-10-05'],
    days: 1,
    requestedOn: '2026-09-25',
    decidedOn: '2026-09-26',
    start: '2026-10-05',
    ...over,
  });

  it('totals, buckets health types together, pro-rates across the window, and finds peaks', () => {
    const r = absenceReport({
      from: '2026-10-01',
      to: '2026-10-31',
      headcount: 4,
      teams: [{ id: 'T1', name: 'Floor' }],
      groups: [{ id: 'G1', name: 'Front desk' }],
      absences: [
        abs({ memberId: 'm1', groupIds: ['G1'] }),
        abs({ memberId: 'm2', leaveTypeName: 'Sick', isHealthRelated: true, requestedOn: '2026-10-05', decidedOn: '2026-10-05' }),
        abs({ memberId: 'm3', leaveTypeName: 'Medical', isHealthRelated: true, chargedDates: ['2026-10-05'], requestedOn: '2026-10-01', decidedOn: '2026-10-04' }),
        // Spans the window end: 2 of 4 days inside.
        abs({ memberId: 'm4', teamId: null, chargedDates: ['2026-10-29', '2026-10-30', '2026-11-02', '2026-11-03'], days: 4, start: '2026-10-29', requestedOn: '2026-10-01', decidedOn: '2026-10-02' }),
        abs({ memberId: 'm1', status: 'pending', chargedDates: ['2026-10-20'], decidedOn: null }),
        abs({ memberId: 'm2', status: 'declined', decidedOn: '2026-10-10' }),
        abs({ memberId: 'm9', chargedDates: ['2026-09-01'], start: '2026-09-01', decidedOn: '2026-08-20' }),
      ],
      hoursWorked: [{ memberId: 'm1', hours: 120 }, { memberId: 'm2', hours: 0 }],
      forfeitRisk: [{ memberId: 'm1', name: 'A', amount: 3, unit: 'days' }, { memberId: 'm2', name: 'B', amount: 0, unit: 'days' }],
    });
    expect(r.totals).toEqual({ approvedDays: 5, pendingDays: 1, requests: 5, peopleWithLeave: 4, daysPerPerson: 1.3 });
    expect(r.byType).toEqual([
      { key: 'Vacation', label: 'Vacation', days: 3, requests: 2 },
      { key: HEALTH_BUCKET, label: HEALTH_BUCKET, days: 2, requests: 2 },
    ]);
    expect(r.byTeam.map((b) => [b.label, b.days])).toEqual([['Floor', 3], ['No team', 2]]);
    expect(r.byGroup).toEqual([{ key: 'G1', label: 'Front desk', days: 1, requests: 1 }]);
    expect(r.byMonth).toEqual([{ key: '2026-10', label: '2026-10', days: 5, requests: 4 }]);
    expect(r.peakDays[0]).toEqual({ date: '2026-10-05', away: 3 });
    expect(r.approval).toEqual({ decided: 4, approved: 3, declined: 1, approvalRatePct: 75, medianDaysToDecide: 2 });
    expect(r.medianLeadDays).toBe(7);
    expect(r.hoursWorked).toEqual({ total: 120, people: 1 });
    expect(r.forfeitRisk).toEqual([{ memberId: 'm1', name: 'A', amount: 3, unit: 'days' }]);
    // No per-type health names anywhere.
    expect(JSON.stringify(r)).not.toMatch(/Medical|"Sick"/);
  });

  it('handles an empty window', () => {
    const r = absenceReport({ from: '2026-10-01', to: '2026-10-31', headcount: 0, teams: [], groups: [], absences: [] });
    expect(r.totals.daysPerPerson).toBe(0);
    expect(r.approval.approvalRatePct).toBeNull();
    expect(r.medianLeadDays).toBeNull();
    expect(r.hoursWorked).toBeNull();
  });
});
