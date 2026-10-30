import { and, eq, inArray, sql } from 'drizzle-orm';
import { addDays } from '@daysoff/engine/solver/dateUtils';
import { hhmm } from '@daysoff/engine/coverage/index';
import type { Db } from '@/db/client';
import { credentials, locations, memberCredentials, members, rooms, webhookEndpoints, type coverRequests } from '@/db/schema';
import { coverageDays, expiryBand, gapWindows, siteContext, sitePacks, type GapWindow } from '@/domain/coverage';
import { isoDate } from '@/domain/leave';
import { emitWebhook } from './webhooks';

/*
 * Coverage webhooks. cover.requested / cover.filled are emitted by the cover workflow;
 * coverage.gap_detected and credential.expiring come from the daily scan (and the gap scan
 * also runs for a site right after a call-off). Payloads carry rule facts and staff ids
 * only: never children, pay, or why someone is absent.
 */

export const GAP_LOOKAHEAD_DAYS = 14;
const NOTICE = 'Not legal advice. Each rule shows its source or "needs verification".';

async function subscribed(db: Db, orgId: string, event: string): Promise<boolean> {
  const [e] = await db
    .select({ id: webhookEndpoints.id })
    .from(webhookEndpoints)
    .where(and(eq(webhookEndpoints.orgId, orgId), eq(webhookEndpoints.active, true), sql`${event} = any(${webhookEndpoints.events})`))
    .limit(1);
  return !!e;
}

const ruleOf = (g: Pick<GapWindow, 'ruleId' | 'label' | 'kind' | 'basis' | 'needsVerification' | 'citation'>) => ({
  id: g.ruleId,
  label: g.label,
  kind: g.kind,
  basis: g.basis,
  needsVerification: g.needsVerification,
  citation: g.citation,
});

/** coverage.gap_detected for each gap window in the next two weeks (approved leave only), once per window and size. */
export async function scanCoverageGaps(db: Db, orgId: string, now: Date, opts: { locationId?: string; days?: number } = {}): Promise<number> {
  if (!(await subscribed(db, orgId, 'coverage.gap_detected'))) return 0;
  const sites = await db.select({ id: locations.id, name: locations.name }).from(locations).where(and(eq(locations.orgId, orgId), opts.locationId ? eq(locations.id, opts.locationId) : undefined));
  let sent = 0;
  for (const site of sites) {
    if ((await sitePacks(db, orgId, site.id)).length === 0) continue;
    const start = isoDate(now);
    const end = addDays(start, (opts.days ?? GAP_LOOKAHEAD_DAYS) - 1);
    const ctx = await siteContext(db, orgId, site.id, start, end);
    const roomName = new Map(ctx.rooms.map((r) => [r.id, r.name]));
    for (const day of coverageDays(ctx, start, end)) {
      if (!day) continue;
      for (const g of gapWindows(day)) {
        const ids = await emitWebhook(
          db,
          orgId,
          'coverage.gap_detected',
          {
            site,
            room: g.roomId ? { id: g.roomId, name: roomName.get(g.roomId) ?? '' } : null,
            date: g.date,
            start: g.start,
            end: g.end,
            rule: ruleOf(g),
            required: g.required,
            present: g.present,
            short: g.short,
            notice: NOTICE,
          },
          now,
          { dedupeKey: `gap:${site.id}:${g.date}:${g.roomId ?? 'site'}:${g.ruleId}:${g.start}-${g.end}:${g.present}/${g.required}` },
        );
        sent += ids.length;
      }
    }
  }
  return sent;
}

/** credential.expiring at 30, 14 and 7 days out, and once when it has expired. */
export async function scanExpiringCredentials(db: Db, orgId: string, now: Date): Promise<number> {
  if (!(await subscribed(db, orgId, 'credential.expiring'))) return 0;
  const today = isoDate(now);
  const rows = await db
    .select({ memberId: members.id, name: members.name, key: credentials.key, credName: credentials.name, expiresOn: memberCredentials.expiresOn })
    .from(memberCredentials)
    .innerJoin(credentials, and(eq(credentials.id, memberCredentials.credentialId), eq(credentials.orgId, orgId)))
    .innerJoin(members, and(eq(members.id, memberCredentials.memberId), eq(members.orgId, orgId)))
    .where(and(eq(memberCredentials.orgId, orgId), sql`${members.deletedAt} is null`, sql`${memberCredentials.expiresOn} is not null`));
  let sent = 0;
  for (const r of rows) {
    const band = expiryBand(r.expiresOn, today);
    if (!band) continue;
    const daysLeft = Math.round((Date.parse(`${r.expiresOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
    // Expired long ago is not news: only announce an expiry in the last week.
    if (band === 'expired' && daysLeft < -7) continue;
    const ids = await emitWebhook(
      db,
      orgId,
      'credential.expiring',
      { member: { id: r.memberId, name: { untrusted_text: r.name } }, credential: { key: r.key, name: r.credName }, expiresOn: r.expiresOn, daysLeft },
      now,
      { dedupeKey: `cred:${r.memberId}:${r.key}:${r.expiresOn}:${band}` },
    );
    sent += ids.length;
  }
  return sent;
}

type CoverRequestRow = typeof coverRequests.$inferSelect;

/** cover.requested / cover.filled body. */
export async function coverEventData(db: Db, req: CoverRequestRow, filledBy?: { id: string; name: string }): Promise<object> {
  const [room] = await db
    .select({ id: rooms.id, name: rooms.name, siteId: locations.id, site: locations.name })
    .from(rooms)
    .innerJoin(locations, eq(locations.id, rooms.locationId))
    .where(and(eq(rooms.orgId, req.orgId), eq(rooms.id, req.roomId)));
  const gap = (req.gap ?? null) as (Omit<Partial<GapWindow>, 'kind'> & { kind?: string }) | null;
  return {
    coverRequest: {
      id: req.id,
      site: { id: room?.siteId ?? req.locationId, name: room?.site ?? '' },
      room: { id: req.roomId, name: room?.name ?? '' },
      date: req.date,
      start: hhmm(req.startMinute),
      end: hhmm(req.endMinute),
      source: req.source,
      rule: gap && gap.kind !== 'manual' && gap.ruleId ? ruleOf(gap as unknown as GapWindow) : null,
      short: gap?.short ?? null,
    },
    ...(filledBy ? { filledBy: { id: filledBy.id, name: { untrusted_text: filledBy.name } } } : {}),
  };
}

export async function memberName(db: Db, orgId: string, id: string): Promise<{ id: string; name: string }> {
  const [m] = await db.select({ id: members.id, name: members.name }).from(members).where(and(eq(members.orgId, orgId), inArray(members.id, [id])));
  return m ?? { id, name: '' };
}
