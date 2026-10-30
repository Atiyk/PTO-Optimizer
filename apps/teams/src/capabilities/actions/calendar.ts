import { and, asc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import { z } from 'zod';
import { extraClosures, leaveRequests, leaveTypes, locations, members, teams } from '@/db/schema';
import { holidayMap } from '@/domain/holidays';
import { getOrg } from '@/domain/leave';
import { CapabilityError } from '../errors';
import { isAdmin } from '../helpers';
import { defineCapability, type Actor } from '../types';

/**
 * Visibility (SPEC §4): who the caller may see as out. Admins see everyone; managers see
 * their team and reports; others follow the org setting. Service agents see the org only
 * when its visibility is "org", and never a leave type for health-related leave.
 */
async function visibleMemberIds(db: Parameters<typeof getOrg>[0], actor: Actor, visibility: 'org' | 'team' | 'custom'): Promise<Set<string> | 'all'> {
  if (isAdmin(actor)) return 'all';
  if (visibility === 'org') return 'all';
  const meId = actor.onBehalfOfMemberId ?? actor.memberId;
  if (!meId) return new Set(); // service agent in a team-visibility org sees nobody
  const [me] = await db.select().from(members).where(and(eq(members.orgId, actor.orgId), eq(members.id, meId)));
  const all = await db.select({ id: members.id, teamId: members.teamId, managerId: members.managerId }).from(members).where(eq(members.orgId, actor.orgId));
  return new Set(all.filter((m) => m.id === meId || (me?.teamId && m.teamId === me.teamId) || m.managerId === meId).map((m) => m.id));
}

const whoIsOutOutput = z.object({
    teams: z.array(
      z.object({
        teamId: z.string().nullable(),
        teamName: z.object({ untrusted_text: z.string() }),
        out: z.array(
          z.object({
            memberId: z.uuid(),
            name: z.object({ untrusted_text: z.string() }),
            start: z.string(),
            end: z.string(),
            part: z.string(),
            status: z.enum(['approved', 'pending']),
            leaveType: z.string().nullable().describe('Null unless the org shows leave types; always null for health-related leave.'),
          }),
        ),
      }),
    ),
  });
type OutTeam = z.infer<typeof whoIsOutOutput>['teams'][number];

export const whoIsOut = defineCapability({
  name: 'whoIsOut',
  description:
    'Lists who is out between two dates (approved leave; pending too if includePending), grouped by team, ' +
    'with names and dates only. The reason is never included, and the leave type only when the org allows it ' +
    'and the leave is not health-related. Respects the org’s visibility rules for the caller.',
  input: z.object({
    from: z.iso.date().describe('YYYY-MM-DD'),
    to: z.iso.date().describe('YYYY-MM-DD, inclusive; at most 366 days after from'),
    teamId: z.uuid().optional().describe('Only this team.'),
    includePending: z.boolean().default(false),
  }),
  output: whoIsOutOutput,
  scope: 'leave:read',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest', 'mcp', 'slack', 'assistant'],
  audit: null,
  async handler({ db, actor }, input) {
    if (input.to < input.from) throw new CapabilityError('invalid_input', 'to must be on or after from.');
    if (Date.parse(input.to) - Date.parse(input.from) > 366 * 86_400_000) throw new CapabilityError('invalid_input', 'The range can be at most 366 days.');
    const org = await getOrg(db, actor.orgId);
    const visible = await visibleMemberIds(db, actor, org.visibility);
    const rows = await db
      .select({ req: leaveRequests, member: members, type: leaveTypes })
      .from(leaveRequests)
      .innerJoin(members, eq(members.id, leaveRequests.memberId))
      .innerJoin(leaveTypes, eq(leaveTypes.id, leaveRequests.leaveTypeId))
      .where(
        and(
          eq(leaveRequests.orgId, actor.orgId),
          inArray(leaveRequests.status, input.includePending ? ['approved', 'pending'] : ['approved']),
          lte(leaveRequests.startDate, input.to),
          gte(leaveRequests.endDate, input.from),
          isNull(members.deletedAt),
          input.teamId ? eq(members.teamId, input.teamId) : undefined,
        ),
      )
      .orderBy(asc(leaveRequests.startDate));
    const teamRows = await db.select().from(teams).where(eq(teams.orgId, actor.orgId));
    const teamName = new Map(teamRows.map((t) => [t.id, t.name]));
    const groups = new Map<string | null, OutTeam>();
    for (const r of rows) {
      if (visible !== 'all' && !visible.has(r.member.id)) continue;
      const key = r.member.teamId;
      if (!groups.has(key)) groups.set(key, { teamId: key, teamName: { untrusted_text: key ? (teamName.get(key) ?? 'Team') : 'No team' }, out: [] });
      const showType = org.showLeaveType && !r.type.isHealthRelated;
      groups.get(key)!.out.push({
        memberId: r.member.id,
        name: { untrusted_text: r.member.name },
        start: r.req.startDate,
        end: r.req.endDate,
        part: r.req.part,
        status: r.req.status as 'approved' | 'pending',
        leaveType: showType ? r.type.key : null,
      });
    }
    return { teams: [...groups.values()].sort((a, b) => a.teamName.untrusted_text.localeCompare(b.teamName.untrusted_text)) };
  },
});

export const listHolidays = defineCapability({
  name: 'listHolidays',
  description:
    'Public holidays (and org closures) for each of the org’s locations between two dates, from the engine’s ' +
    'per-country data with observed-date rules. Holidays are never deducted from leave.',
  input: z.object({ from: z.iso.date(), to: z.iso.date() }),
  output: z.object({
    locations: z.array(z.object({ locationId: z.uuid(), name: z.string(), countryCode: z.string(), holidays: z.array(z.object({ date: z.string(), name: z.string() })) })),
  }),
  scope: 'leave:read',
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'read',
  surfaces: ['ui', 'rest', 'mcp', 'assistant'],
  audit: null,
  async handler({ db, actor }, input) {
    if (input.to < input.from || Date.parse(input.to) - Date.parse(input.from) > 400 * 86_400_000) {
      throw new CapabilityError('invalid_input', 'Use a range of at most about 13 months, with to on or after from.');
    }
    const locs = await db.select().from(locations).where(eq(locations.orgId, actor.orgId));
    const closures = await db.select().from(extraClosures).where(and(eq(extraClosures.orgId, actor.orgId), gte(extraClosures.date, input.from), lte(extraClosures.date, input.to)));
    const out = [];
    for (const l of locs) {
      const map = await holidayMap(l.countryCode, l.subdivisionCode, input.from, input.to);
      for (const c of closures) if (!c.locationId || c.locationId === l.id) map.set(c.date, c.name);
      out.push({ locationId: l.id, name: l.name, countryCode: l.countryCode, holidays: [...map].sort().map(([date, name]) => ({ date, name })) });
    }
    return { locations: out };
  },
});
