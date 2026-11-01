import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { hhmm, parseHhmm } from '@daysoff/engine/coverage/timeBlocks';
import { annualUseCheck, sickPolicyFromRule } from '@daysoff/engine/coverage/sickLeave';
import { rulesOf, type RulePack } from '@daysoff/engine/coverage/types';
import { planYearContaining } from '@daysoff/engine/leave/calendar';
import { SEED_PACKS, seedPack } from '@daysoff/engine/rulepacks';
import {
  credentials,
  demandExceptions,
  demandTemplates,
  leavePolicies,
  leaveTypes,
  locations,
  memberCredentials,
  memberPayRates,
  members,
  organizations,
  rooms,
  rulePacks,
  shiftExceptions,
  shiftTemplates,
  siteRulePacks,
  VERTICALS,
} from '@/db/schema';
import type { Db } from '@/db/client';
import { coverageDays, expiryBand, gapWindows, getLocation, siteContext, assertValidPack } from '@/domain/coverage';
import { balanceView, getLeaveTypeByKey, getMember, isoDate, ledgerFor } from '@/domain/leave';
import { CapabilityError } from '../errors';
import { actingMemberId, isAdmin, untrusted } from '../helpers';
import { defineCapability, type Actor } from '../types';
import { commitCoverageRows, undoCoverageBatch, validateCoverageRows } from './coverageCsv';

export const NOT_LEGAL_ADVICE =
  'Not legal advice. Each rule shows its source and the date we read it, or "needs verification". Confirm the rules that apply to you with your licensing agency or an employment lawyer.';

const isoDay = z.iso.date().describe('YYYY-MM-DD');
const hhmmStr = z.string().regex(/^\d{1,2}:\d{2}$/, 'HH:MM');
export const isManagerPlus = (a: Actor) => a.role === 'owner' || a.role === 'admin' || a.role === 'manager';

/** Staff see their own site; managers and admins any site in the org. */
async function readableSite(db: Db, actor: Actor, locationId: string | undefined): Promise<string> {
  const me = actingMemberId(actor);
  const own = me ? (await getMember(db, actor.orgId, me)).locationId : null;
  const target = locationId ?? own;
  if (!target) throw new CapabilityError('invalid_input', 'Pass locationId: this member has no home site.');
  await getLocation(db, actor.orgId, target);
  if (!isManagerPlus(actor) && actor.type !== 'service-agent' && target !== own) {
    throw new CapabilityError('forbidden', 'Staff can see coverage for their own site only.');
  }
  return target;
}

const citationOut = z
  .object({ regulation: z.string(), section: z.string(), url: z.string(), retrievedOn: z.string(), publisher: z.string() })
  .nullable();
const gapOut = z.object({
  date: z.string(),
  roomId: z.string().nullable(),
  roomName: z.string().nullable(),
  start: z.string(),
  end: z.string(),
  kind: z.enum(['ratio', 'role_present', 'group_size', 'no_ratio_rule']),
  ruleId: z.string(),
  label: z.string(),
  required: z.number(),
  present: z.number(),
  short: z.number().describe('Staff missing (0 for group-size problems, which staffing cannot fix).'),
  basis: z.enum(['law', 'org_policy']),
  needsVerification: z.boolean(),
  citation: citationOut,
});

export const getCoverage = defineCapability({
  name: 'getCoverage',
  description:
    'Staffing coverage for a site, computed by the engine from its rule pack (staff-to-child ratios, required ' +
    'roles), demand counts, the schedule, approved leave and credential expiry: per room and 30-minute block, ' +
    'how many staff are required, how many count, and every gap with the rule it breaks and that rule\'s ' +
    'citation. Use it to answer "are we in ratio on Friday afternoon" or "where are the gaps this week". Reads ' +
    'only. Quote these numbers; never compute ratios yourself. Not legal advice.',
  input: z.object({
    locationId: z.uuid().optional().describe('Site id. Defaults to the caller\'s home site.'),
    date: isoDay.optional().describe('First local date. Defaults to today.'),
    days: z.number().int().min(1).max(14).default(1),
    includePending: z.boolean().default(false).describe('Count pending leave as out too ("likely" view).'),
    detail: z.enum(['gaps', 'blocks']).default('gaps').describe('"blocks" adds the full room × block grid (for the heatmap).'),
  }),
  output: z.object({
    site: z.object({ id: z.string(), name: z.string(), timezone: z.string() }),
    regulated: z.boolean().describe('False when the site has no rule pack: coverage then uses the simpler team minimums.'),
    packs: z.array(z.object({ key: z.string(), version: z.number(), name: z.string(), notes: z.array(z.string()) })),
    rooms: z.array(z.object({ id: z.string(), name: z.string(), groupKey: z.string().nullable() })),
    days: z.array(
      z.object({
        date: z.string(),
        regulated: z.boolean(),
        open: z.boolean().describe('False when no children or bookings are expected all day (closed).'),
        gaps: z.array(gapOut),
        grid: z
          .array(
            z.object({
              block: z.string(),
              rooms: z.array(z.object({ roomId: z.string(), children: z.number(), required: z.number(), present: z.number(), gap: z.number(), groupProblem: z.boolean() })),
              siteGap: z.number(),
            }),
          )
          .nullable(),
      }),
    ),
    notice: z.string(),
  }),
  scope: 'coverage:read',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest', 'mcp', 'slack', 'assistant'],
  audit: null,
  async handler({ db, actor, now }, input) {
    const locationId = await readableSite(db, actor, input.locationId);
    const start = input.date ?? isoDate(now);
    const end = addDays(start, input.days - 1);
    const ctx = await siteContext(db, actor.orgId, locationId, start, end);
    const days = coverageDays(ctx, start, end, { includePending: input.includePending });
    const roomName = new Map(ctx.rooms.map((r) => [r.id, r.name]));
    const latest = new Map<string, (typeof ctx.packs)[number]>();
    for (const p of ctx.packs) latest.set(p.key, p);
    return {
      site: { id: ctx.location.id, name: ctx.location.name, timezone: ctx.location.timezone },
      regulated: ctx.packs.length > 0,
      packs: [...latest.values()].map((p) => ({ key: p.key, version: p.version, name: p.pack.name, notes: [...(p.pack.notes ?? [])] })),
      rooms: ctx.rooms.map((r) => ({ id: r.id, name: r.name, groupKey: r.groupKey })),
      days: days.map((day, i) => {
        const date = addDays(start, i);
        if (!day) return { date, regulated: false, open: false, gaps: [], grid: null };
        const gaps = gapWindows(day).map((g) => ({ ...g, roomName: g.roomId ? (roomName.get(g.roomId) ?? null) : null }));
        let grid = null;
        if (input.detail === 'blocks') {
          const active = day.blocks.filter((b) => day.rooms.some((r) => r.block.key === b.key && (r.children > 0 || r.present > 0 || r.required > 0)));
          const first = active[0]?.utcStart ?? Infinity;
          const last = active.at(-1)?.utcStart ?? -Infinity;
          grid = day.blocks
            .filter((b) => b.utcStart >= first && b.utcStart <= last)
            .map((b) => ({
              block: b.key.slice(11),
              rooms: day.rooms
                .filter((r) => r.block.key === b.key)
                .map((r) => ({ roomId: r.roomId, children: r.children, required: r.required, present: r.present, gap: r.gap, groupProblem: r.shortfalls.some((s) => s.kind === 'group_size') })),
              siteGap: day.site.find((s) => s.block.key === b.key)?.gap ?? 0,
            }));
        }
        return { date, regulated: true, open: day.rooms.some((r) => r.children > 0), gaps, grid };
      }),
      notice: NOT_LEGAL_ADVICE,
    };
  },
});

const weekday = z.number().int().min(0).max(6).describe('Monday = 0 … Sunday = 6.');

export const manageSchedule = defineCapability({
  name: 'manageSchedule',
  description:
    'Admin-only coverage setup: the org vertical, rooms/posts per site, the rule packs a site follows, weekly ' +
    'demand counts per room (counts only, never child details), and weekly shift templates or dated changes per ' +
    'member. One operation per call.',
  input: z.discriminatedUnion('op', [
    z.object({ op: z.literal('setVertical'), vertical: z.enum(VERTICALS), costAwareRanking: z.boolean().optional() }),
    z.object({
      op: z.literal('upsertRoom'),
      roomId: z.uuid().optional(),
      locationId: z.uuid(),
      name: z.string().trim().min(1).max(80),
      kind: z.enum(['room', 'post']).default('room'),
      groupKey: z.string().max(40).nullable().default(null),
    }),
    z.object({ op: z.literal('archiveRoom'), roomId: z.uuid() }),
    z.object({ op: z.literal('setTimezone'), locationId: z.uuid(), timezone: z.string().min(1).max(64).describe('IANA time zone, e.g. "America/Los_Angeles".') }),
    z.object({
      op: z.literal('selectRulePack'),
      locationId: z.uuid(),
      packKey: z.string().max(80).describe('A seed pack key (e.g. "childcare-us-ca", "labor-us-ca") or an org pack key.'),
      effectiveFrom: isoDay.optional(),
      sickPolicy: z.enum(['none', 'accrue', 'frontload']).default('accrue').describe('For labour packs: create the site\'s sick-leave policy from the pack.'),
      employeeCount: z.number().int().min(1).optional().describe('Employer size, for laws that tier by headcount. Defaults to the org\'s active members.'),
    }),
    z.object({
      op: z.literal('setDemand'),
      roomId: z.uuid(),
      rows: z.array(z.object({ weekday, start: hhmmStr, end: hhmmStr, group: z.string().min(1).max(40), count: z.number().int().min(0).max(500) })).max(200),
    }),
    z.object({
      op: z.literal('addDemandException'),
      roomId: z.uuid(),
      date: isoDay,
      closed: z.boolean().default(false),
      start: hhmmStr.optional(),
      end: hhmmStr.optional(),
      group: z.string().max(40).optional(),
      count: z.number().int().min(0).max(500).optional(),
    }),
    z.object({
      op: z.literal('setShifts'),
      memberId: z.uuid(),
      rows: z.array(z.object({ roomId: z.uuid(), weekday, start: hhmmStr, end: hhmmStr })).max(50),
    }),
    z.object({
      op: z.literal('addShiftException'),
      memberId: z.uuid(),
      date: isoDay,
      kind: z.enum(['shift', 'off']),
      roomId: z.uuid().optional(),
      start: hhmmStr.optional(),
      end: hhmmStr.optional(),
    }),
  ]),
  output: z.object({ ok: z.literal(true), op: z.string(), id: z.string().nullable() }),
  scope: 'admin',
  roles: ['owner', 'admin'],
  effect: 'commit',
  idempotent: false,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  rateLimit: 'write',
  surfaces: ['ui', 'rest'],
  audit: (i) => `Coverage setup: ${i.op}`,
  async handler({ db, actor, now }, input) {
    const orgId = actor.orgId;
    const room = async (id: string) => {
      const [r] = await db.select().from(rooms).where(and(eq(rooms.orgId, orgId), eq(rooms.id, id)));
      if (!r) throw new CapabilityError('not_found', 'Room not found in this organization.');
      return r;
    };
    const mins = (s: string) => {
      const m = parseHhmm(s);
      return m >= 1440 ? 0 : m;
    };
    switch (input.op) {
      case 'setVertical': {
        await db
          .update(organizations)
          .set({ vertical: input.vertical, ...(input.costAwareRanking != null ? { costAwareRanking: input.costAwareRanking } : {}) })
          .where(eq(organizations.id, orgId));
        // Pay rates exist only while cost-aware ranking or payout money estimates are on: turning the last one off deletes them.
        if (input.costAwareRanking === false) {
          const [o] = await db.select({ payout: organizations.payoutMoneyEstimates }).from(organizations).where(eq(organizations.id, orgId));
          if (!o?.payout) await db.delete(memberPayRates).where(eq(memberPayRates.orgId, orgId));
        }
        return { ok: true as const, op: input.op, id: null };
      }
      case 'upsertRoom': {
        await getLocation(db, orgId, input.locationId);
        if (input.roomId) {
          await room(input.roomId);
          await db.update(rooms).set({ name: input.name, kind: input.kind, groupKey: input.groupKey, locationId: input.locationId }).where(and(eq(rooms.orgId, orgId), eq(rooms.id, input.roomId)));
          return { ok: true as const, op: input.op, id: input.roomId };
        }
        const [r] = await db.insert(rooms).values({ orgId, locationId: input.locationId, name: input.name, kind: input.kind, groupKey: input.groupKey }).returning();
        return { ok: true as const, op: input.op, id: r!.id };
      }
      case 'archiveRoom': {
        await room(input.roomId);
        await db.update(rooms).set({ archivedAt: now }).where(and(eq(rooms.orgId, orgId), eq(rooms.id, input.roomId)));
        return { ok: true as const, op: input.op, id: input.roomId };
      }
      case 'setTimezone': {
        await getLocation(db, orgId, input.locationId);
        try {
          new Intl.DateTimeFormat('en-US', { timeZone: input.timezone });
        } catch {
          throw new CapabilityError('invalid_input', `"${input.timezone}" is not a time zone (try "America/Los_Angeles").`);
        }
        await db.update(locations).set({ timezone: input.timezone }).where(and(eq(locations.orgId, orgId), eq(locations.id, input.locationId)));
        return { ok: true as const, op: input.op, id: input.locationId };
      }
      case 'selectRulePack': {
        await getLocation(db, orgId, input.locationId);
        const effectiveFrom = input.effectiveFrom ?? isoDate(now);
        const [orgPack] = await db
          .select()
          .from(rulePacks)
          .where(and(eq(rulePacks.orgId, orgId), eq(rulePacks.key, input.packKey)))
          .orderBy(sql`${rulePacks.version} desc`)
          .limit(1);
        let packRow = orgPack;
        if (!packRow) {
          const seed = seedPack(input.packKey);
          if (!seed) throw new CapabilityError('not_found', `No rule pack "${input.packKey}". Seed packs: ${SEED_PACKS.map((p) => p.key).join(', ')}.`);
          assertValidPack(seed);
          [packRow] = await db.insert(rulePacks).values({ orgId, key: seed.key, version: seed.version, pack: seed, source: 'seed', createdByMemberId: actor.memberId }).returning();
        }
        const pack = packRow!.pack as RulePack;
        // Close any earlier link to the same pack key at this site, then link this version.
        const links = await db
          .select({ link: siteRulePacks, key: rulePacks.key })
          .from(siteRulePacks)
          .innerJoin(rulePacks, eq(rulePacks.id, siteRulePacks.rulePackId))
          .where(and(eq(siteRulePacks.orgId, orgId), eq(siteRulePacks.locationId, input.locationId)));
        for (const l of links) {
          if (l.key === pack.key && !l.link.effectiveTo) {
            await db.update(siteRulePacks).set({ effectiveTo: addDays(effectiveFrom, -1) }).where(eq(siteRulePacks.id, l.link.id));
          }
        }
        const [link] = await db.insert(siteRulePacks).values({ orgId, locationId: input.locationId, rulePackId: packRow!.id, effectiveFrom }).returning();
        if (pack.vertical !== 'general') await db.update(organizations).set({ vertical: pack.vertical }).where(and(eq(organizations.id, orgId), eq(organizations.vertical, 'general')));
        const sick = rulesOf(pack, 'sick_accrual');
        if (sick.length && input.sickPolicy !== 'none') await applySickPolicy(db, orgId, input.locationId, pack, input.sickPolicy === 'frontload', effectiveFrom, input.employeeCount);
        return { ok: true as const, op: input.op, id: link!.id };
      }
      case 'setDemand': {
        await room(input.roomId);
        for (const r of input.rows) if (mins(r.end) === mins(r.start)) throw new CapabilityError('invalid_input', `Demand ${r.start}–${r.end}: start and end are the same.`);
        await db.transaction(async (tx) => {
          const t = tx as unknown as Db;
          await t.delete(demandTemplates).where(and(eq(demandTemplates.orgId, orgId), eq(demandTemplates.roomId, input.roomId)));
          if (input.rows.length) {
            await t.insert(demandTemplates).values(
              input.rows.map((r) => ({ orgId, roomId: input.roomId, weekday: r.weekday, startMinute: mins(r.start), endMinute: r.end === '24:00' ? 1440 : mins(r.end), groupKey: r.group, count: r.count })),
            );
          }
        });
        return { ok: true as const, op: input.op, id: input.roomId };
      }
      case 'addDemandException': {
        await room(input.roomId);
        if (!input.closed && (input.group == null || input.count == null)) throw new CapabilityError('invalid_input', 'Give group and count, or closed: true.');
        const [r] = await db
          .insert(demandExceptions)
          .values({
            orgId,
            roomId: input.roomId,
            date: input.date,
            closed: input.closed,
            startMinute: input.start ? mins(input.start) : null,
            endMinute: input.end ? (input.end === '24:00' ? 1440 : mins(input.end)) : null,
            groupKey: input.group ?? null,
            count: input.count ?? null,
          })
          .returning();
        return { ok: true as const, op: input.op, id: r!.id };
      }
      case 'setShifts': {
        await getMember(db, orgId, input.memberId);
        for (const r of input.rows) {
          await room(r.roomId);
          if (mins(r.start) === mins(r.end)) throw new CapabilityError('invalid_input', `Shift ${r.start}–${r.end}: start and end are the same.`);
        }
        await db.transaction(async (tx) => {
          const t = tx as unknown as Db;
          await t.delete(shiftTemplates).where(and(eq(shiftTemplates.orgId, orgId), eq(shiftTemplates.memberId, input.memberId)));
          if (input.rows.length) {
            await t.insert(shiftTemplates).values(input.rows.map((r) => ({ orgId, memberId: input.memberId, roomId: r.roomId, weekday: r.weekday, startMinute: mins(r.start), endMinute: mins(r.end) })));
          }
        });
        return { ok: true as const, op: input.op, id: input.memberId };
      }
      case 'addShiftException': {
        await getMember(db, orgId, input.memberId);
        if (input.kind === 'shift') {
          if (!input.roomId || !input.start || !input.end) throw new CapabilityError('invalid_input', 'A shift needs roomId, start and end.');
          await room(input.roomId);
        }
        const [r] = await db
          .insert(shiftExceptions)
          .values({
            orgId,
            memberId: input.memberId,
            date: input.date,
            kind: input.kind,
            roomId: input.roomId ?? null,
            startMinute: input.start ? mins(input.start) : null,
            endMinute: input.end ? mins(input.end) : null,
          })
          .returning();
        return { ok: true as const, op: input.op, id: r!.id };
      }
    }
  },
});

/** Labour pack → the site's sick-leave policy on the existing policy model (C4). */
async function applySickPolicy(db: Db, orgId: string, locationId: string, pack: RulePack, frontload: boolean, effectiveFrom: string, employeeCount?: number) {
  const n =
    employeeCount ??
    Number(
      (await db.select({ n: sql<number>`count(*)` }).from(members).where(and(eq(members.orgId, orgId), isNull(members.deletedAt))))[0]?.n ?? 0,
    );
  const rules = rulesOf(pack, 'sick_accrual');
  const rule =
    rules.find((r) => !r.employerSize || ((r.employerSize.min == null || n >= r.employerSize.min) && (r.employerSize.max == null || n <= r.employerSize.max))) ?? rules[0]!;
  let [sick] = await db.select().from(leaveTypes).where(and(eq(leaveTypes.orgId, orgId), eq(leaveTypes.key, 'sick')));
  if (!sick) [sick] = await db.insert(leaveTypes).values({ orgId, key: 'sick', name: 'Sick', isHealthRelated: true }).returning();
  const policy = sickPolicyFromRule(rule, { frontload: frontload && rule.frontloadHours != null });
  const citations: Record<string, string> = {};
  if (rule.citation) citations.accrual = `${rule.citation.regulation} ${rule.citation.section} (${rule.citation.url}, read ${rule.citation.retrievedOn})`;
  if (rule.needsVerification) citations.needsVerification = rule.reason;
  await db.insert(leavePolicies).values({
    orgId,
    leaveTypeId: sick!.id,
    name: `${pack.name}: ${rule.label}`,
    appliesTo: { locationIds: [locationId] },
    effectiveFrom,
    policy,
    citations,
  });
}

export const manageCredentials = defineCapability({
  name: 'manageCredentials',
  description:
    'Admin-only: define credential types (e.g. CPR, fully qualified teacher, hygienist licence) and record, ' +
    'update or remove a member\'s credential with issue and expiry dates and where the evidence is kept. An ' +
    'expired credential stops counting from its expiry date.',
  input: z.discriminatedUnion('op', [
    z.object({ op: z.literal('define'), key: z.string().trim().min(1).max(48).regex(/^[a-z0-9_]+$/), name: z.string().trim().min(1).max(80), needsExpiry: z.boolean().default(true) }),
    z.object({
      op: z.literal('grant'),
      memberId: z.uuid(),
      credentialKey: z.string().min(1).max(48),
      issuedOn: isoDay.nullable().default(null),
      expiresOn: isoDay.nullable().default(null),
      evidenceRef: z.string().max(200).nullable().default(null),
      verified: z.boolean().default(false),
    }),
    z.object({ op: z.literal('remove'), memberCredentialId: z.uuid() }),
  ]),
  output: z.object({ ok: z.literal(true), op: z.string(), id: z.string() }),
  scope: 'admin',
  roles: ['owner', 'admin'],
  effect: 'commit',
  idempotent: false,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  rateLimit: 'write',
  surfaces: ['ui', 'rest'],
  audit: (i) => `Credentials: ${i.op}${'credentialKey' in i ? ` ${i.credentialKey}` : 'key' in i ? ` ${i.key}` : ''}`,
  async handler({ db, actor, now }, input) {
    const orgId = actor.orgId;
    if (input.op === 'define') {
      const [existing] = await db.select().from(credentials).where(and(eq(credentials.orgId, orgId), eq(credentials.key, input.key)));
      if (existing) {
        await db.update(credentials).set({ name: input.name, needsExpiry: input.needsExpiry }).where(eq(credentials.id, existing.id));
        return { ok: true as const, op: input.op, id: existing.id };
      }
      const [c] = await db.insert(credentials).values({ orgId, key: input.key, name: input.name, needsExpiry: input.needsExpiry }).returning();
      return { ok: true as const, op: input.op, id: c!.id };
    }
    if (input.op === 'grant') {
      await getMember(db, orgId, input.memberId);
      const [c] = await db.select().from(credentials).where(and(eq(credentials.orgId, orgId), eq(credentials.key, input.credentialKey)));
      if (!c) throw new CapabilityError('not_found', `No credential type "${input.credentialKey}". Define it first.`);
      if (c.needsExpiry && !input.expiresOn) throw new CapabilityError('invalid_input', `${c.name} needs an expiry date.`);
      if (input.issuedOn && input.expiresOn && input.expiresOn < input.issuedOn) throw new CapabilityError('invalid_input', 'Expiry is before the issue date.');
      const [r] = await db
        .insert(memberCredentials)
        .values({
          orgId,
          memberId: input.memberId,
          credentialId: c.id,
          issuedOn: input.issuedOn,
          expiresOn: input.expiresOn,
          evidenceRef: input.evidenceRef,
          verifiedByMemberId: input.verified ? actor.memberId : null,
          verifiedAt: input.verified ? now : null,
        })
        .returning();
      return { ok: true as const, op: input.op, id: r!.id };
    }
    const [row] = await db.select().from(memberCredentials).where(and(eq(memberCredentials.orgId, orgId), eq(memberCredentials.id, input.memberCredentialId)));
    if (!row) throw new CapabilityError('not_found', 'Credential record not found in this organization.');
    await db.delete(memberCredentials).where(and(eq(memberCredentials.orgId, orgId), eq(memberCredentials.id, input.memberCredentialId)));
    return { ok: true as const, op: input.op, id: row.id };
  },
});

export const getCredentials = defineCapability({
  name: 'getCredentials',
  description:
    'Credential records with expiry alerts (expired, or within 7, 14 or 30 days). Staff see their own; managers ' +
    'and admins see everyone, or one member with memberId. Reads only.',
  input: z.object({ memberId: z.uuid().optional(), alertsOnly: z.boolean().default(false) }),
  output: z.object({
    types: z.array(z.object({ key: z.string(), name: z.string(), needsExpiry: z.boolean() })),
    records: z.array(
      z.object({
        id: z.string(),
        memberId: z.string(),
        memberName: z.string(),
        key: z.string(),
        name: z.string(),
        issuedOn: z.string().nullable(),
        expiresOn: z.string().nullable(),
        band: z.enum(['expired', '7', '14', '30']).nullable(),
        verified: z.boolean(),
        evidence: z.object({ untrusted_text: z.string() }).nullable(),
      }),
    ),
  }),
  scope: 'coverage:read',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest'],
  audit: null,
  async handler({ db, actor, now }, input) {
    const me = actingMemberId(actor);
    const all = isManagerPlus(actor);
    if (!all && input.memberId && input.memberId !== me) throw new CapabilityError('forbidden', 'Staff can see their own credentials only.');
    const target = all ? input.memberId : me;
    if (!all && !target) throw new CapabilityError('forbidden', 'This needs a member identity.');
    if (target) await getMember(db, actor.orgId, target);
    const today = isoDate(now);
    const types = await db.select().from(credentials).where(eq(credentials.orgId, actor.orgId)).orderBy(credentials.name);
    const rows = await db
      .select({ r: memberCredentials, key: credentials.key, name: credentials.name, memberName: members.name })
      .from(memberCredentials)
      .innerJoin(credentials, eq(credentials.id, memberCredentials.credentialId))
      .innerJoin(members, and(eq(members.id, memberCredentials.memberId), isNull(members.deletedAt)))
      .where(and(eq(memberCredentials.orgId, actor.orgId), target ? eq(memberCredentials.memberId, target) : undefined))
      .orderBy(memberCredentials.expiresOn);
    const records = rows
      .map((x) => ({
        id: x.r.id,
        memberId: x.r.memberId,
        memberName: x.memberName,
        key: x.key,
        name: x.name,
        issuedOn: x.r.issuedOn,
        expiresOn: x.r.expiresOn,
        band: expiryBand(x.r.expiresOn, today),
        verified: !!x.r.verifiedAt,
        evidence: untrusted(x.r.evidenceRef),
      }))
      .filter((r) => !input.alertsOnly || r.band);
    return { types: types.map((t) => ({ key: t.key, name: t.name, needsExpiry: t.needsExpiry })), records };
  },
});

export const importHoursWorked = defineCapability({
  name: 'importHoursWorked',
  description:
    'Admin-only: record hours actually worked per member per pay period (from payroll or a time clock), which ' +
    'drives hourly sick-leave accrual. stage "preview" validates; "commit" writes all rows or none and returns a ' +
    'batchId; "undo" voids a batch. CSV files go through importCsv with kind "hours".',
  input: z.object({
    stage: z.enum(['preview', 'commit', 'undo']),
    rows: z
      .array(z.object({ member: z.string().min(1).max(200).describe('Member id, email or exact name.'), periodStart: isoDay, periodEnd: isoDay, hours: z.number().min(0).max(744) }))
      .max(5000)
      .default([]),
    batchId: z.uuid().optional(),
  }),
  output: z.object({
    rows: z.array(z.object({ line: z.number(), errors: z.array(z.string()) })),
    errorCount: z.number(),
    committed: z.number(),
    batchId: z.string().nullable(),
    undone: z.number(),
  }),
  scope: 'admin',
  roles: ['owner', 'admin'],
  effect: 'commit',
  idempotent: false,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  rateLimit: 'write',
  surfaces: ['ui', 'rest'],
  audit: (i, o) => `Hours worked ${i.stage}: ${o.committed} rows written, ${o.undone} voided, ${o.errorCount} errors`,
  async handler({ db, actor, now }, input) {
    if (input.stage === 'undo') {
      if (!input.batchId) throw new CapabilityError('invalid_input', 'Undo needs batchId.');
      const undone = await undoCoverageBatch(db, actor.orgId, 'hours', input.batchId, now);
      return { rows: [], errorCount: 0, committed: 0, batchId: input.batchId, undone };
    }
    const results = await validateCoverageRows(
      db,
      actor.orgId,
      'hours',
      input.rows.map((r, i) => ({ line: i + 1, get: (k: string) => String((r as Record<string, unknown>)[k] ?? '') })),
      (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null),
    );
    const errorCount = results.reduce((n, r) => n + r.errors.length, 0);
    const rows = results.map((r) => ({ line: r.line, errors: r.errors }));
    if (input.stage === 'preview' || errorCount) return { rows, errorCount, committed: 0, batchId: null, undone: 0 };
    const batchId = crypto.randomUUID();
    const committed = await commitCoverageRows(db, actor.orgId, 'hours', results, batchId, actor.memberId, now);
    return { rows, errorCount, committed, batchId, undone: 0 };
  },
});

export const getSickLeave = defineCapability({
  name: 'getSickLeave',
  description:
    'Hourly sick leave for a member, from imported hours worked and the site\'s sick-leave law (rule pack): ' +
    'balance, what is usable now (and until when it is locked), used this year against the annual use cap, and ' +
    'every ledger line with the engine\'s explanation (e.g. "1 per 30 hours worked × 40 hours"). Staff see their ' +
    'own; managers and admins anyone. Reads only. Not legal advice.',
  input: z.object({ memberId: z.uuid().optional(), asOf: isoDay.optional() }),
  output: z.object({
    memberId: z.string(),
    hasPolicy: z.boolean(),
    policyName: z.string().nullable(),
    source: z.string().nullable().describe('The citation of the law the policy came from, or null.'),
    unit: z.enum(['days', 'hours']),
    balance: z.number(),
    usable: z.number(),
    lockedUntil: z.string().nullable(),
    useCap: z.object({ cap: z.number().nullable(), usedThisYear: z.number(), remaining: z.number().nullable() }),
    entries: z.array(z.object({ date: z.string(), kind: z.string(), amount: z.number(), balanceAfter: z.number(), note: z.string() })),
    notice: z.string(),
  }),
  scope: 'coverage:read',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest'],
  audit: null,
  async handler({ db, actor, now }, input) {
    const me = actingMemberId(actor);
    const id = input.memberId ?? me;
    if (!id) throw new CapabilityError('invalid_input', 'Pass memberId.');
    if (id !== me && !isManagerPlus(actor)) throw new CapabilityError('forbidden', 'Staff can see their own sick leave only.');
    const member = await getMember(db, actor.orgId, id);
    const type = await getLeaveTypeByKey(db, actor.orgId, 'sick');
    const asOf = input.asOf ?? isoDate(now);
    const { projection: p, hasPolicy } = await balanceView(db, actor.orgId, member, type, asOf);
    const [pol] = member.locationId
      ? await db
          .select()
          .from(leavePolicies)
          .where(and(eq(leavePolicies.orgId, actor.orgId), eq(leavePolicies.leaveTypeId, type.id), sql`${leavePolicies.appliesTo} -> 'locationIds' ? ${member.locationId}`))
          .orderBy(sql`${leavePolicies.effectiveFrom} desc`)
          .limit(1)
      : [];
    const policy = (pol?.policy ?? null) as { annualUseCap?: number | null; planYear?: { type: 'calendar' } } | null;
    const year = planYearContaining(policy?.planYear ?? { type: 'calendar' }, member.startDate, asOf);
    const use = annualUseCheck({ annualUseCap: policy?.annualUseCap ?? null }, await ledgerFor(db, actor.orgId, member.id, type.id), year, 0);
    const cit = (pol?.citations ?? null) as Record<string, string> | null;
    return {
      memberId: member.id,
      hasPolicy,
      policyName: pol?.name ?? null,
      source: cit?.accrual ?? null,
      unit: p.unit,
      balance: p.asOf.balance,
      usable: p.asOf.usable,
      lockedUntil: p.asOf.lockedUntil,
      useCap: { cap: use.cap, usedThisYear: use.usedThisYear, remaining: use.remaining },
      entries: p.timeline.filter((t) => t.date <= asOf).map((t) => ({ date: t.date, kind: t.kind, amount: t.amount, balanceAfter: t.balanceAfter, note: t.source === 'scheduled' ? t.note : t.kind })),
      notice: NOT_LEGAL_ADVICE,
    };
  },
});

/** Seed packs a site can pick, with their citations (for the setup form). */
export const listRulePacks = defineCapability({
  name: 'listRulePacks',
  description: 'The rule packs available to this org (seed packs plus the org\'s saved versions), with every rule and its citation or "needs verification". Reads only. Not legal advice.',
  input: z.object({ locationId: z.uuid().optional() }),
  output: z.object({
    packs: z.array(z.object({ key: z.string(), version: z.number(), source: z.string(), pack: z.unknown() })),
    selected: z.array(z.object({ key: z.string(), version: z.number(), effectiveFrom: z.string(), effectiveTo: z.string().nullable() })),
    notice: z.string(),
  }),
  scope: 'coverage:read',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest'],
  audit: null,
  async handler({ db, actor }, input) {
    const own = await db.select().from(rulePacks).where(eq(rulePacks.orgId, actor.orgId));
    const ownKeys = new Set(own.map((p) => `${p.key}@${p.version}`));
    const packs = [
      ...own.map((p) => ({ key: p.key, version: p.version, source: p.source, pack: p.pack })),
      ...SEED_PACKS.filter((p) => !ownKeys.has(`${p.key}@${p.version}`)).map((p) => ({ key: p.key, version: p.version, source: 'seed', pack: p as unknown })),
    ];
    let selected: { key: string; version: number; effectiveFrom: string; effectiveTo: string | null }[] = [];
    if (input.locationId) {
      await getLocation(db, actor.orgId, input.locationId);
      const rows = await db
        .select({ key: rulePacks.key, version: rulePacks.version, effectiveFrom: siteRulePacks.effectiveFrom, effectiveTo: siteRulePacks.effectiveTo })
        .from(siteRulePacks)
        .innerJoin(rulePacks, eq(rulePacks.id, siteRulePacks.rulePackId))
        .where(and(eq(siteRulePacks.orgId, actor.orgId), eq(siteRulePacks.locationId, input.locationId)));
      selected = rows;
    }
    return { packs, selected, notice: NOT_LEGAL_ADVICE };
  },
});

export const getCoverageSetup = defineCapability({
  name: 'getCoverageSetup',
  description:
    'Coverage setup for the admin screens: sites with their rooms, linked rule packs, weekly demand (children ' +
    'per age group, counts only) and weekly staff schedules. Managers and admins. Reads only.',
  input: z.object({}),
  output: z.object({
    vertical: z.string(),
    costAwareRanking: z.boolean(),
    sites: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        timezone: z.string(),
        packs: z.array(z.object({ key: z.string(), version: z.number(), name: z.string(), effectiveFrom: z.string(), effectiveTo: z.string().nullable() })),
        groups: z.array(z.object({ key: z.string(), label: z.string() })),
        rooms: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            kind: z.string(),
            groupKey: z.string().nullable(),
            demand: z.array(z.object({ weekday: z.number(), start: z.string(), end: z.string(), group: z.string(), count: z.number() })),
          }),
        ),
      }),
    ),
    shifts: z.array(z.object({ memberId: z.string(), roomId: z.string(), weekday: z.number(), start: z.string(), end: z.string() })),
    seedPacks: z.array(z.object({ key: z.string(), name: z.string(), vertical: z.string(), jurisdiction: z.string() })),
  }),
  scope: 'coverage:read',
  roles: ['owner', 'admin', 'manager'],
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest'],
  audit: null,
  async handler({ db, actor }) {
    const orgId = actor.orgId;
    const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
    const locs = await db.select().from(locations).where(eq(locations.orgId, orgId)).orderBy(locations.createdAt);
    const rs = await db.select().from(rooms).where(and(eq(rooms.orgId, orgId), isNull(rooms.archivedAt))).orderBy(rooms.name);
    const dem = await db.select().from(demandTemplates).where(eq(demandTemplates.orgId, orgId)).orderBy(demandTemplates.weekday, demandTemplates.startMinute);
    const links = await db
      .select({ link: siteRulePacks, key: rulePacks.key, version: rulePacks.version, pack: rulePacks.pack })
      .from(siteRulePacks)
      .innerJoin(rulePacks, eq(rulePacks.id, siteRulePacks.rulePackId))
      .where(eq(siteRulePacks.orgId, orgId))
      .orderBy(siteRulePacks.effectiveFrom);
    const shifts = await db
      .select({ s: shiftTemplates })
      .from(shiftTemplates)
      .innerJoin(members, and(eq(members.id, shiftTemplates.memberId), isNull(members.deletedAt)))
      .where(eq(shiftTemplates.orgId, orgId))
      .orderBy(shiftTemplates.weekday, shiftTemplates.startMinute);
    const end = (m: number) => (m === 1440 ? '24:00' : hhmm(m));
    return {
      vertical: org!.vertical,
      costAwareRanking: org!.costAwareRanking,
      sites: locs.map((l) => {
        const mine = links.filter((x) => x.link.locationId === l.id);
        const groups = new Map<string, string>();
        for (const x of mine) if (!x.link.effectiveTo) for (const g of (x.pack as RulePack).ageGroups ?? []) groups.set(g.key, g.label);
        return {
          id: l.id,
          name: l.name,
          timezone: l.timezone,
          packs: mine.map((x) => ({ key: x.key, version: x.version, name: (x.pack as RulePack).name, effectiveFrom: x.link.effectiveFrom, effectiveTo: x.link.effectiveTo })),
          groups: [...groups].map(([key, label]) => ({ key, label })),
          rooms: rs
            .filter((r) => r.locationId === l.id)
            .map((r) => ({
              id: r.id,
              name: r.name,
              kind: r.kind,
              groupKey: r.groupKey,
              demand: dem.filter((d) => d.roomId === r.id).map((d) => ({ weekday: d.weekday, start: hhmm(d.startMinute), end: end(d.endMinute), group: d.groupKey, count: d.count })),
            })),
        };
      }),
      shifts: shifts.map(({ s: x }) => ({ memberId: x.memberId, roomId: x.roomId, weekday: x.weekday, start: hhmm(x.startMinute), end: hhmm(x.endMinute) })),
      seedPacks: SEED_PACKS.map((p) => ({ key: p.key, name: p.name, vertical: p.vertical, jurisdiction: [p.jurisdiction.city, p.jurisdiction.state, p.jurisdiction.country].filter(Boolean).join(', ') })),
    };
  },
});

export { hhmm, isAdmin };
