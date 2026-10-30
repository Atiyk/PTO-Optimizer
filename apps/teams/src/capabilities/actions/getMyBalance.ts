import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { sumAmounts } from '@daysoff/engine/ledger/fixedPoint';
import { balanceLedger, members } from '@/db/schema';
import { CapabilityError } from '../errors';
import { defineCapability } from '../types';

export const getMyBalance = defineCapability({
  name: 'getMyBalance',
  description:
    "Returns the calling member's current leave balance for one leave type, computed by the " +
    'engine from the append-only ledger. Use it to answer "how many days do I have left". ' +
    'It only reads; it never changes a balance. A service agent with no member identity ' +
    'cannot call it (there is no "me").',
  input: z.object({
    leaveType: z
      .string()
      .min(1)
      .max(64)
      .default('vacation')
      .describe('Leave type key, e.g. "vacation" or "sick". Defaults to "vacation".'),
  }),
  output: z.object({
    memberId: z.uuid(),
    leaveType: z.string(),
    unit: z.enum(['days', 'hours']),
    balance: z.number().describe('Engine-computed balance. Never estimate this yourself.'),
    entryCount: z.number().int().nonnegative(),
  }),
  scope: 'leave:read',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest', 'mcp', 'slack', 'assistant'],
  audit: null,
  async handler({ db, actor }, input) {
    const memberId = actor.onBehalfOfMemberId ?? actor.memberId;
    if (!memberId) {
      throw new CapabilityError(
        'forbidden',
        'getMyBalance needs a member identity. Service agents should use a member-addressed read instead.',
      );
    }
    // Tenant isolation: the member must exist in the caller's org and not be deleted.
    const [member] = await db
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.id, memberId), eq(members.orgId, actor.orgId), isNull(members.deletedAt)));
    if (!member) throw new CapabilityError('not_found', 'Member not found in this organization.');

    const rows = await db
      .select({ amount: balanceLedger.amount, unit: balanceLedger.unit })
      .from(balanceLedger)
      .where(
        and(
          eq(balanceLedger.orgId, actor.orgId),
          eq(balanceLedger.memberId, memberId),
          eq(balanceLedger.leaveType, input.leaveType),
        ),
      );
    return {
      memberId,
      leaveType: input.leaveType,
      unit: rows[0]?.unit ?? 'days',
      balance: sumAmounts(rows.map((r) => r.amount)),
      entryCount: rows.length,
    };
  },
});
