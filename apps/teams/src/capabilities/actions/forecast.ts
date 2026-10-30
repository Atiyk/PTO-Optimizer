import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { locations } from '@/db/schema';
import { getLocation, sitePacks } from '@/domain/coverage';
import { siteForecast } from '@/domain/forecast';
import { isoDate } from '@/domain/leave';
import { memberToday } from '@/domain/cover';
import { actingMemberId } from '../helpers';
import { defineCapability } from '../types';
import { NOT_LEGAL_ADVICE } from './coverage';

const hours = z.object({
  schedule: z.number().describe('Short even with nobody on leave: the rota itself does not meet the rules.'),
  credential: z.number().describe('Extra shortfall because a required credential (e.g. first aid) has expired.'),
  approved: z.number().describe('Extra shortfall from approved leave.'),
  pending: z.number().describe('Extra shortfall if pending requests are approved.'),
});

export const getCoverageForecast = defineCapability({
  name: 'getCoverageForecast',
  description:
    'Looks ahead several weeks at a regulated site (or every regulated site) and says, per week, how many ' +
    'staff-hours the site will be short of its staffing rules and why: the rota itself, expiring credentials, ' +
    'approved leave, or pending leave. Lists credentials that expire in the range with the first day each one ' +
    'leaves a room short, and, for pending requests that would open a gap, the nearest dates (moved by whole ' +
    'days) that would not. All numbers come from the coverage engine; quote them. Reads only. Not legal advice.',
  input: z.object({
    locationId: z.uuid().optional().describe('One site. Omit for every regulated site in the organization.'),
    start: z.iso.date().optional().describe('First day; defaults to today at the site.'),
    weeks: z.number().int().min(1).max(12).default(8),
  }),
  output: z.object({
    start: z.string(),
    weeks: z.number(),
    sites: z.array(
      z.object({
        site: z.object({ id: z.string(), name: z.string() }),
        totals: hours,
        weeks: z.array(z.object({ weekStart: z.string(), weekEnd: z.string(), hoursShort: hours, gapDates: z.array(z.string()), regulatedDays: z.number() })),
        credentialAlerts: z.array(
          z.object({
            memberId: z.string(),
            name: z.object({ untrusted_text: z.string() }),
            credential: z.string(),
            credentialName: z.string(),
            expiresOn: z.string(),
            firstGapDate: z.string().nullable().describe('First day the expiry leaves a room short while they are scheduled.'),
            gapDays: z.number(),
          }),
        ),
        staggers: z.array(
          z.object({
            requestId: z.string(),
            memberId: z.string(),
            name: z.object({ untrusted_text: z.string() }),
            start: z.string(),
            end: z.string(),
            hoursAdded: z.number(),
            firstGap: z.object({ date: z.string(), start: z.string(), end: z.string(), label: z.string(), short: z.number(), roomName: z.string().nullable() }),
            suggestion: z.object({ start: z.string(), end: z.string(), shiftDays: z.number() }).nullable().describe('Same request moved by whole days so it opens no gap at this site; null when nothing within two weeks works.'),
          }),
        ),
        stats: z.object({ days: z.number(), engineRuns: z.number(), ms: z.number() }),
      }),
    ),
    notice: z.string(),
  }),
  scope: 'coverage:read',
  roles: ['owner', 'admin', 'manager'],
  effect: 'read',
  idempotent: true,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  rateLimit: 'planner',
  surfaces: ['ui', 'rest', 'mcp', 'assistant'],
  audit: null,
  async handler({ db, actor, now }, input) {
    let ids: { id: string; name: string }[];
    if (input.locationId) {
      const l = await getLocation(db, actor.orgId, input.locationId);
      ids = [{ id: l.id, name: l.name }];
    } else {
      ids = await db.select({ id: locations.id, name: locations.name }).from(locations).where(and(eq(locations.orgId, actor.orgId))).orderBy(asc(locations.name));
    }
    const me = actingMemberId(actor);
    const start = input.start ?? (me ? await memberToday(db, actor.orgId, me, now) : isoDate(now));
    const sites = [];
    for (const s of ids) {
      if ((await sitePacks(db, actor.orgId, s.id)).length === 0) continue;
      const f = await siteForecast(db, actor.orgId, s.id, start, input.weeks);
      sites.push({
        site: s,
        totals: f.totals,
        weeks: f.weeks,
        credentialAlerts: f.credentialAlerts.map(({ memberName, ...a }) => ({ ...a, name: { untrusted_text: memberName } })),
        staggers: f.staggers.map(({ memberName, ...x }) => ({ ...x, name: { untrusted_text: memberName } })),
        stats: f.stats,
      });
    }
    return { start, weeks: input.weeks, sites, notice: `${NOT_LEGAL_ADVICE} Forecast to ${addDays(start, input.weeks * 7 - 1)} from today's rota, leave and credentials; it changes as they do.` };
  },
});
