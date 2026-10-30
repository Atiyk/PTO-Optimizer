import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { memberCoverPrefs, passkeys } from '@/db/schema';
import { getLocation } from '@/domain/coverage';
import { getMember } from '@/domain/leave';
import { issueLoginCode } from '@/server/staffAuth';
import { CapabilityError } from '../errors';
import { actingMemberId } from '../helpers';
import { defineCapability } from '../types';

/*
 * Staff sign-in management (admins) and each person's own cover preferences. The sign-in
 * ceremonies themselves are routes (/api/auth/code, /api/auth/passkey/*), like Slack OIDC.
 */

export const manageStaffSignIn = defineCapability({
  name: 'manageStaffSignIn',
  description:
    'Admin-only: issue a one-time sign-in code for a staff member without Slack (10 characters, valid 15 minutes, ' +
    'single use; read it to them in person or by phone), list their passkeys, or revoke one (lost phone).',
  input: z.discriminatedUnion('op', [
    z.object({ op: z.literal('issueCode'), memberId: z.uuid() }),
    z.object({ op: z.literal('listPasskeys'), memberId: z.uuid() }),
    z.object({ op: z.literal('revokePasskey'), passkeyId: z.uuid() }),
  ]),
  output: z.object({
    code: z.string().nullable().describe('Shown once. Never stored in plain text.'),
    expiresAt: z.string().nullable(),
    passkeys: z.array(z.object({ id: z.string(), name: z.string().nullable(), createdAt: z.string(), lastUsedAt: z.string().nullable() })),
  }),
  scope: 'admin',
  roles: ['owner', 'admin'],
  effect: 'commit',
  idempotent: false,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  rateLimit: 'write',
  surfaces: ['ui', 'rest'],
  audit: (i) => (i.op === 'issueCode' ? 'Issued a one-time sign-in code' : i.op === 'revokePasskey' ? 'Revoked a passkey' : 'Listed passkeys'),
  async handler({ db, actor, now }, input) {
    if (input.op === 'issueCode') {
      const { code, expiresAt } = await issueLoginCode(db, actor.orgId, input.memberId, actor.memberId, now);
      return { code, expiresAt: expiresAt.toISOString(), passkeys: [] };
    }
    if (input.op === 'revokePasskey') {
      const r = await db.delete(passkeys).where(and(eq(passkeys.orgId, actor.orgId), eq(passkeys.id, input.passkeyId))).returning({ id: passkeys.id });
      if (!r.length) throw new CapabilityError('not_found', 'Passkey not found.');
      return { code: null, expiresAt: null, passkeys: [] };
    }
    await getMember(db, actor.orgId, input.memberId);
    const rows = await db.select().from(passkeys).where(and(eq(passkeys.orgId, actor.orgId), eq(passkeys.memberId, input.memberId)));
    return {
      code: null,
      expiresAt: null,
      passkeys: rows.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt.toISOString(), lastUsedAt: p.lastUsedAt?.toISOString() ?? null })),
    };
  },
});

const prefsOut = z.object({ optIn: z.enum(['yes', 'no', 'ask']), allowedLocationIds: z.array(z.string()), smsOptIn: z.boolean(), smsPhoneSet: z.boolean() });

export const setMyCoverPrefs = defineCapability({
  name: 'setMyCoverPrefs',
  description:
    'Your cover preferences: whether you want cover offers ("yes", "no", or "ask"), which other sites you will cover ' +
    'at, and whether offers may also come by text message (only when your employer has turned texts on). Omit a ' +
    'field to keep it. With no fields, reads them.',
  input: z.object({
    optIn: z.enum(['yes', 'no', 'ask']).optional(),
    allowedLocationIds: z.array(z.uuid()).max(20).optional(),
    smsOptIn: z.boolean().optional(),
    smsPhone: z
      .string()
      .regex(/^\+[1-9]\d{6,14}$/, 'Use the international format, e.g. +15551234567')
      .nullable()
      .optional(),
  }),
  output: prefsOut,
  scope: 'cover:respond',
  effect: 'commit',
  idempotent: true,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  rateLimit: 'write',
  surfaces: ['ui', 'rest'],
  audit: null,
  async handler({ db, actor }, input) {
    const me = actingMemberId(actor);
    if (!me) throw new CapabilityError('forbidden', 'Only a member has cover preferences.');
    for (const l of input.allowedLocationIds ?? []) await getLocation(db, actor.orgId, l);
    const set = {
      ...(input.optIn ? { optIn: input.optIn } : {}),
      ...(input.allowedLocationIds ? { allowedLocationIds: input.allowedLocationIds } : {}),
      ...(input.smsOptIn != null ? { smsOptIn: input.smsOptIn } : {}),
      ...(input.smsPhone !== undefined ? { smsPhone: input.smsPhone } : {}),
    };
    const [row] = await db
      .insert(memberCoverPrefs)
      .values({ orgId: actor.orgId, memberId: me, ...set })
      .onConflictDoUpdate({ target: [memberCoverPrefs.orgId, memberCoverPrefs.memberId], set: Object.keys(set).length ? set : { optIn: memberCoverPrefs.optIn } })
      .returning();
    return { optIn: row!.optIn, allowedLocationIds: row!.allowedLocationIds, smsOptIn: row!.smsOptIn, smsPhoneSet: !!row!.smsPhone };
  },
});
