import { describe, expect, it } from 'vitest';
import { MAX_APPROVAL_INPUT, parseApprovalMessage, type ApprovalParseResult, type ApprovalRequestLike } from './approvalParser';

const TODAY = '2026-11-04';
const REQUESTS: ApprovalRequestLike[] = [
  { id: 'winter', start: '2026-12-22', end: '2026-12-24', status: 'planned' },
  { id: 'newyear', start: '2026-12-28', end: '2027-01-02', status: 'requested' },
  { id: 'spring', start: '2027-03-15', end: '2027-03-19', status: 'approved' },
  { id: 'july', start: '2027-07-05', end: '2027-07-09', status: 'planned' },
];

interface Case {
  name: string;
  text: string;
  locale?: string;
  requests?: ApprovalRequestLike[];
  decision: ApprovalParseResult['decision'];
  ranges?: [string, string][];
  match?: string | null;
  reason?: ApprovalParseResult['matchReason'];
  confidence?: ApprovalParseResult['confidence'];
  evidence?: RegExp;
  notes?: string[];
}

const CASES: Case[] = [
  // ---- plain manager replies
  { name: 'short approval with the original request quoted', text: 'Approved, enjoy!\n\nOn Mon, Nov 2, 2026 at 9:14 AM Jordan Lee <jordan@example.com> wrote:\n> Hi Jordan, could I take Dec 22–24 off?\n> Thanks, Sam',
    decision: 'approved', ranges: [['2026-12-22', '2026-12-24']], match: 'winter', reason: 'exact', evidence: /Approved, enjoy!/ },
  { name: '"Sounds good" with no dates anywhere', text: 'Sounds good', decision: 'approved', ranges: [], match: null, reason: 'no-dates', confidence: 'medium', notes: ['weak-decision'] },
  { name: 'denial wording beats the word approve', text: "Unfortunately we can't approve Dec 22–24 because of the release freeze.", decision: 'rejected', ranges: [['2026-12-22', '2026-12-24']], match: 'winter', evidence: /can't approve/ },
  { name: '"Not approved." in reply to a subject with dates', text: 'Subject: Re: PTO Dec 22-24\n\nNot approved.', decision: 'rejected', match: 'winter', evidence: /Not approved/ },
  { name: 'curly apostrophe negation', text: 'Sorry Sam, I can’t approve Dec 22-24 this year.', decision: 'rejected', match: 'winter' },
  { name: '"not able to approve"', text: "I'm not able to approve the Dec 28 - Jan 2 request.", decision: 'rejected', ranges: [['2026-12-28', '2027-01-02']], match: 'newyear', reason: 'exact' },
  { name: '"we have to decline"', text: 'We have to decline your request for December 22-24.', decision: 'rejected', match: 'winter' },
  { name: '"that is not going to work"', text: "Dec 22 - Dec 24 is not going to work for the team, sorry.", decision: 'rejected', match: 'winter' },
  { name: 'weak positive with an emoji', text: 'No problem, enjoy your time off! \u{1F44D} Dec 22-24', decision: 'approved', match: 'winter', confidence: 'medium' },
  { name: 'a bare "No."', text: 'No.\n\n> Can I take Dec 22-24?', decision: 'rejected', match: 'winter', confidence: 'medium', notes: ['weak-decision'] },
  { name: 'uppercase APPROVED', text: 'APPROVED - DEC 22-24', decision: 'approved', match: 'winter', confidence: 'high' },
  { name: '"pre-approved" is still approved', text: 'Your Dec 22-24 dates are pre-approved.', decision: 'approved', match: 'winter' },
  { name: '"disapproved" is a rejection', text: 'Your Dec 22-24 request was disapproved.', decision: 'rejected', match: 'winter' },

  // ---- HR system notifications
  { name: 'Gmail forward of a BambooHR-style notification', text: [
    'FYI, see below', '', '---------- Forwarded message ---------', 'From: BambooHR <notifications@app.bamboohr.com>', 'Date: Tue, Nov 3, 2026 at 4:02 PM',
    'Subject: Time off request approved', 'To: <sam@example.com>', '', 'Hi Sam,', 'Your time off request for Dec 22 - Dec 24, 2026 (3 days of Vacation) has been approved by Jordan Lee.',
  ].join('\n'), decision: 'approved', ranges: [['2026-12-22', '2026-12-24']], match: 'winter', reason: 'exact', confidence: 'high', evidence: /Time off request approved/ },
  { name: 'Workday-style subject with numeric dates', text: 'Subject: Request Time Off: Sam Rivera on 12/22/2026 - 12/24/2026 (Vacation) - Approved\n\nThe business process has been Successfully Completed.',
    decision: 'approved', ranges: [['2026-12-22', '2026-12-24']], match: 'winter', confidence: 'high' },
  { name: 'Gusto-style approval across a year boundary', text: 'Jordan approved your time off request for Dec 28, 2026 to Jan 2, 2027.', decision: 'approved', ranges: [['2026-12-28', '2027-01-02']], match: 'newyear', reason: 'exact', confidence: 'high' },
  { name: 'Rippling-style denial with weekdays', text: 'Your leave request for Tue, Dec 22 - Thu, Dec 24 was denied.\nReason: release coverage', decision: 'rejected', ranges: [['2026-12-22', '2026-12-24']], match: 'winter', confidence: 'high' },
  { name: 'ADP manager-side "requires your approval" is not an approval', text: 'ADP Workforce Now Notification Employee - Time Off Request requires your approval.\nDec 22, 2026 - Dec 24, 2026',
    decision: 'unclear', match: 'winter', confidence: 'low', notes: ['pending'] },
  { name: 'Apple Mail forward of a status line', text: 'Begin forwarded message:\n\nFrom: HR <hr@example.com>\nSubject: Leave update\n\nStatus: Approved\nDates: 2026-12-22 to 2026-12-24', decision: 'approved', match: 'winter', reason: 'exact' },
  { name: 'Outlook reply: decision on top, dates in the original below', text: 'Approved.\n\nFrom: Sam Rivera\nSent: Monday, November 2, 2026 9:14 AM\nTo: Jordan Lee\nSubject: PTO request Dec 22-24\n\nHi Jordan, could you approve Dec 22-24?',
    decision: 'approved', ranges: [['2026-12-22', '2026-12-24']], match: 'winter', notes: ['dates-outside-decision'] },
  { name: '"submitted on" dates are not leave dates', text: 'Your request submitted on Nov 2, 2026 for Dec 22 - Dec 24 has been approved.', decision: 'approved', ranges: [['2026-12-22', '2026-12-24']], match: 'winter' },
  { name: 'header Sent: dates are ignored', text: 'Approved\nSent: Dec 1, 2026', decision: 'approved', ranges: [], reason: 'no-dates' },

  // ---- date shapes
  { name: 'month names across years, year only on the end', text: 'Approved: December 22 - January 2, 2027', decision: 'approved', ranges: [['2026-12-22', '2027-01-02']], match: 'newyear', reason: 'overlap', confidence: 'medium' },
  { name: 'yearless range wrapping New Year', text: 'Approved for Dec 28 – Jan 2', decision: 'approved', ranges: [['2026-12-28', '2027-01-02']], match: 'newyear', reason: 'exact' },
  { name: 'unambiguous d/m/y numeric', text: 'Approved 22/12/2026', decision: 'approved', ranges: [['2026-12-22', '2026-12-22']], match: 'winter', reason: 'overlap' },
  { name: 'ambiguous numeric with no locale is low confidence', text: 'Approved: 07/05/2027 - 07/09/2027', decision: 'approved', ranges: [['2027-07-05', '2027-07-09']], match: 'july', confidence: 'low', notes: ['day-month-ambiguous'] },
  { name: 'ambiguous numeric resolved by an en-GB locale', text: 'Approved: 05/07/2027 - 09/07/2027', locale: 'en-GB', decision: 'approved', ranges: [['2027-07-05', '2027-07-09']], match: 'july', confidence: 'medium', notes: ['day-month-from-locale'] },
  { name: 'ambiguous numeric resolved by an en-US locale', text: 'Approved: 07/05/2027 - 07/09/2027', locale: 'en-US', decision: 'approved', ranges: [['2027-07-05', '2027-07-09']], match: 'july' },
  { name: 'one unambiguous numeric date settles the order for the rest', text: 'Approved: 05/07/2027 - 09/07/2027 (week of 13/07/2027 is busy)', decision: 'approved', ranges: [['2027-07-05', '2027-07-09'], ['2027-07-13', '2027-07-13']], match: 'july' },
  { name: 'dotted European dates', text: 'Genehmigt / approved: 22.12.2026 - 24.12.2026', decision: 'approved', ranges: [['2026-12-22', '2026-12-24']], match: 'winter', reason: 'exact' },
  { name: 'yearless numeric range', text: '12/22 - 12/24 approved', decision: 'approved', ranges: [['2026-12-22', '2026-12-24']], match: 'winter' },
  { name: 'day-first month range', text: 'Approved for 22–24 December 2026.', decision: 'approved', ranges: [['2026-12-22', '2026-12-24']], match: 'winter', reason: 'exact' },
  { name: 'ordinals and "until"', text: 'Approved from December 22nd until December 24th.', decision: 'approved', ranges: [['2026-12-22', '2026-12-24']], match: 'winter' },
  { name: '"between ... and ..."', text: "You're approved between Dec 22 and Dec 24.", decision: 'approved', ranges: [['2026-12-22', '2026-12-24']], match: 'winter' },
  { name: 'single weekday date', text: 'Approved: Tue, Dec 22', decision: 'approved', ranges: [['2026-12-22', '2026-12-22']], match: 'winter', notes: [] },
  { name: 'missing year means the next occurrence on or after today', text: 'Oct 1 - Oct 3 approved', decision: 'approved', ranges: [['2027-10-01', '2027-10-03']], match: null, reason: 'no-overlap' },
  { name: 'only an already-approved request overlaps', text: 'Mar 15-19 approved', decision: 'approved', ranges: [['2027-03-15', '2027-03-19']], match: null, reason: 'already-decided' },

  // ---- adversarial
  { name: 'weekday that contradicts the date is low confidence', text: 'Approved: Mon, Dec 22', decision: 'approved', confidence: 'low', notes: ['weekday-mismatch'] },
  { name: '"not approved yet" is pending, not approved', text: 'This is not approved yet, Dec 22-24 is with HR.', decision: 'unclear', match: 'winter', notes: ['pending'] },
  { name: 'the user pasting their own request', text: 'Hi Jordan, please approve my time off Dec 22-24.', decision: 'unclear', match: 'winter' },
  { name: 'mixed decision for different days', text: 'Dec 22-23 approved, but Dec 24 is denied.', decision: 'unclear', confidence: 'low', notes: ['mixed-decision'] },
  { name: 'a quoted "approved" question does not count', text: 'Let me check with HR and get back to you.\n\nOn Mon, Nov 2, 2026 at 9:14 AM Sam wrote:\n> Is Dec 22-24 approved?', decision: 'unclear', ranges: [['2026-12-22', '2026-12-24']], notes: ['pending'] },
  { name: 'canceled is not approved', text: 'Your time off request for Dec 22 - Dec 24 was canceled.', decision: 'unclear', match: 'winter' },
  { name: 'friendly words plus "unfortunately" are unclear', text: 'Sounds good. Unfortunately I am out next week, so loop in Sam.', decision: 'unclear' },
  { name: 'fractions, versions and IPs are not dates', text: 'Build 1.2.3 on 10.0.0.1 — 3/4 of the team is in, take 1/2 day. Approved.', decision: 'approved', ranges: [] },
  { name: '"Dec 2 - 3 days" is one date, not a range', text: 'Approved for Dec 2 - 3 days notice is fine', decision: 'approved', ranges: [['2026-12-02', '2026-12-02']] },
  { name: 'an impossible date is dropped', text: 'Approved for Feb 30', decision: 'approved', ranges: [] },
  { name: 'a span longer than three years is dropped', text: 'Approved: Jan 1, 2027 - Jan 1, 2031', decision: 'approved', ranges: [] },
  { name: 'empty input', text: '', decision: 'unclear', ranges: [], confidence: 'low' },
  { name: 'HTML is stripped as text, never kept as markup', text: '<p>Approved!</p><script>alert(1)</script><div>Dec 22-24</div>', decision: 'approved', match: 'winter' },
  { name: 'no tracked requests at all', text: 'Approved Dec 22-24', requests: [], decision: 'approved', match: null, reason: 'no-requests' },
  { name: 'two requests overlap equally', text: 'Approved Dec 20 - Dec 30', requests: [
    { id: 'a', start: '2026-12-21', end: '2026-12-23', status: 'planned' }, { id: 'b', start: '2026-12-26', end: '2026-12-28', status: 'requested' },
  ], decision: 'approved', match: null, reason: 'ambiguous' },
];

describe('parseApprovalMessage table', () => {
  it('has at least 30 cases', () => expect(CASES.length).toBeGreaterThanOrEqual(30));
  for (const c of CASES) {
    it(c.name, () => {
      const result = parseApprovalMessage(c.text, { today: TODAY, requests: c.requests ?? REQUESTS, locale: c.locale });
      expect(result.decision).toBe(c.decision);
      if (c.ranges) expect(result.dateRanges.map((r) => [r.start, r.end])).toEqual(c.ranges);
      if (c.match !== undefined) expect(result.matchedRequestId ?? null).toBe(c.match);
      if (c.reason) expect(result.matchReason).toBe(c.reason);
      if (c.confidence) expect(result.confidence).toBe(c.confidence);
      if (c.evidence) expect(result.evidence.join(' | ')).toMatch(c.evidence);
      if (c.notes) {
        if (c.notes.length === 0) expect(result.notes.filter((n) => n !== 'dates-outside-decision')).toEqual([]);
        for (const note of c.notes) expect(result.notes).toContain(note);
      }
      for (const phrase of [...result.evidence, ...result.dateRanges.map((r) => r.sourceText)]) {
        expect(phrase).not.toMatch(/[<>]/);
        expect(c.text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').toLowerCase().replace(/’/g, "'")).toContain(phrase.toLowerCase());
      }
    });
  }
});

describe('parseApprovalMessage guards', () => {
  it('reads only the first 20,000 characters', () => {
    const text = 'Approved Dec 22-24. ' + 'x'.repeat(MAX_APPROVAL_INPUT) + ' Denied.';
    const result = parseApprovalMessage(text, { today: TODAY, requests: REQUESTS });
    expect(result.decision).toBe('approved');
    expect(result.notes).toContain('truncated');
  });
  it('is deterministic and does not mutate the requests', () => {
    const requests = REQUESTS.map((r) => ({ ...r }));
    const text = 'Approved, enjoy!\n> Dec 22-24';
    const a = parseApprovalMessage(text, { today: TODAY, requests });
    const b = parseApprovalMessage(text, { today: TODAY, requests });
    expect(a).toEqual(b);
    expect(requests).toEqual(REQUESTS);
  });
  it('stays fast on hostile repetitive input', () => {
    const text = ('Dec 22 - - - 1/1/ 12/12/12/12 not not not approved ' ).repeat(400).slice(0, MAX_APPROVAL_INPUT);
    const started = performance.now();
    parseApprovalMessage(text, { today: TODAY, requests: REQUESTS });
    expect(performance.now() - started).toBeLessThan(1500);
  });
  it('a later year boundary: on Dec 30 a yearless "Jan 4-6" is next month', () => {
    const result = parseApprovalMessage('Approved Jan 4-6', { today: '2026-12-30', requests: [] });
    expect(result.dateRanges).toEqual([{ start: '2027-01-04', end: '2027-01-06', sourceText: 'Jan 4-6' }]);
  });
});
