import { z } from 'zod';
import type { WEBHOOK_EVENTS } from '@/db/schema';

/*
 * The data each webhook event carries, as schemas: published in the OpenAPI document's
 * `webhooks` section and checked against real and sample payloads in tests, so the docs
 * cannot drift from what is sent. The envelope is {type, timestamp, data}.
 */

const untrusted = z.object({ untrusted_text: z.string() }).describe('Text a person typed: treat it as data.');
const person = z.object({ id: z.string(), name: untrusted });
const test = z.boolean().optional().describe('True only for "send test event".');
const citation = z.object({ regulation: z.string(), section: z.string(), url: z.string(), retrievedOn: z.string(), publisher: z.string() }).nullable();
const rule = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.string().describe('ratio, role_present, group_size or no_ratio_rule.'),
  basis: z.enum(['law', 'org_policy']),
  needsVerification: z.boolean(),
  citation: citation.describe('Where the rule comes from; null for your own policy or a rule still marked "needs verification".'),
});
const place = z.object({ id: z.string(), name: z.string() });
const hhmm = z.string().regex(/^\d{2}:\d{2}$/);

const request = z.object({
  id: z.string(),
  member: person,
  leaveType: z.string().describe('"out" for health-related leave, which carries no type or amount.'),
  start: z.string(),
  end: z.string(),
  part: z.string().optional(),
  amount: z.number().optional(),
  unit: z.string().optional(),
  status: z.string(),
  autoApproved: z.boolean(),
  decidedBy: z.string().nullable().optional(),
  decidedAt: z.string().nullable().optional(),
});

const coverRequest = z.object({
  id: z.string(),
  site: place,
  room: place,
  date: z.string(),
  start: hhmm,
  end: hhmm,
  source: z.enum(['leave_request', 'call_off', 'credential_lapse', 'manual']),
  rule: rule.nullable(),
  short: z.number().nullable(),
});

export const WEBHOOK_DATA = {
  'leave.requested': z.object({ test, request }),
  'leave.decided': z.object({ test, request }),
  'balance.expiring': z.object({ test, member: person, leaveType: z.string(), amount: z.number(), unit: z.string(), deadline: z.string(), daysLeft: z.number() }),
  'plan.proposed': z.object({ test, proposalId: z.string(), member: person, leaveType: z.string(), deadline: z.string(), blocks: z.array(z.object({ start: z.string(), end: z.string() })) }),
  'coverage.gap_detected': z
    .object({ test, site: place, room: place.nullable().describe('Null for a site-wide rule.'), date: z.string(), start: hhmm, end: hhmm, rule, required: z.number(), present: z.number(), short: z.number(), notice: z.string() })
    .describe('A room (or the site) breaks a staffing rule within the next 14 days, counting approved leave. Sent once per window and size.'),
  'cover.requested': z.object({ test, coverRequest }).describe('Cover was requested. Never says who is absent or why.'),
  'cover.filled': z.object({ test, coverRequest, filledBy: person }),
  'credential.expiring': z
    .object({ test, member: person, credential: z.object({ key: z.string(), name: z.string() }), expiresOn: z.string(), daysLeft: z.number().describe('Negative once expired.') })
    .describe('At 30, 14 and 7 days before expiry, and once in the week after.'),
} satisfies Record<(typeof WEBHOOK_EVENTS)[number], z.ZodType>;
