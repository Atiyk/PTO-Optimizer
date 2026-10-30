import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { WEBHOOK_EVENTS, webhookDeliveries, webhookEndpoints } from '@/db/schema';
import { deliverDue, emitWebhook, newWebhookSecret, sampleEventData, sealSecret, webhookUrlProblem } from '@/server/webhooks';
import { CapabilityError } from '../errors';
import { actingMemberId } from '../helpers';
import { defineCapability } from '../types';

const eventList = z.array(z.enum(WEBHOOK_EVENTS)).min(1);

const endpointView = z.object({
  id: z.uuid(),
  url: z.string(),
  events: z.array(z.string()),
  active: z.boolean(),
  createdAt: z.string(),
  health: z.enum(['new', 'healthy', 'failing']),
  lastDeliveredAt: z.string().nullable(),
});

const deliveryView = z.object({
  id: z.uuid(),
  endpointId: z.uuid(),
  event: z.string(),
  status: z.enum(['pending', 'delivered', 'failed']),
  attempts: z.number(),
  lastStatusCode: z.number().nullable(),
  lastError: z.string().nullable(),
  nextAttemptAt: z.string().nullable(),
  createdAt: z.string(),
  test: z.boolean(),
});

export const manageWebhooks = defineCapability({
  name: 'manageWebhooks',
  description:
    'Admin only. Webhook endpoints that receive signed events (leave.requested, leave.decided, ' +
    'balance.expiring, plan.proposed): list endpoints with their health and the recent delivery log, add ' +
    'one (signing secret shown once), pause or resume it, delete it, send a test event, or retry a delivery now.',
  input: z.discriminatedUnion('op', [
    z.object({ op: z.literal('list') }),
    z.object({ op: z.literal('create'), url: z.string().max(500), events: eventList }),
    z.object({ op: z.literal('setActive'), endpointId: z.uuid(), active: z.boolean() }),
    z.object({ op: z.literal('delete'), endpointId: z.uuid() }),
    z.object({ op: z.literal('sendTest'), endpointId: z.uuid(), event: z.enum(WEBHOOK_EVENTS) }),
    z.object({ op: z.literal('retry'), deliveryId: z.uuid() }),
  ]),
  output: z.object({
    endpoints: z.array(endpointView),
    deliveries: z.array(deliveryView),
    created: z.object({ endpointId: z.uuid(), secret: z.string() }).nullable(),
    test: z.object({ ok: z.boolean(), statusCode: z.number().nullable(), error: z.string().nullable() }).nullable(),
  }),
  scope: 'admin',
  roles: ['owner', 'admin'],
  effect: 'commit',
  idempotent: false,
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
  rateLimit: 'write',
  surfaces: ['ui'],
  audit: (i) => `Webhooks: ${i.op}${i.op === 'create' ? ` ${new URL(i.url).host} (${i.events.join(', ')})` : ''}${i.op === 'setActive' ? (i.active ? ' resume' : ' pause') : ''}`,
  async handler({ db, actor, now }, input) {
    if (actor.type !== 'human') throw new CapabilityError('forbidden', 'Only a signed-in admin can manage webhooks.');
    const orgId = actor.orgId;
    const endpoint = async (id: string) => {
      const [e] = await db.select().from(webhookEndpoints).where(and(eq(webhookEndpoints.orgId, orgId), eq(webhookEndpoints.id, id)));
      if (!e) throw new CapabilityError('not_found', 'Webhook not found.');
      return e;
    };
    let created: { endpointId: string; secret: string } | null = null;
    let test: { ok: boolean; statusCode: number | null; error: string | null } | null = null;

    switch (input.op) {
      case 'create': {
        const problem = webhookUrlProblem(input.url);
        if (problem) throw new CapabilityError('invalid_input', problem);
        const secret = newWebhookSecret();
        const [e] = await db
          .insert(webhookEndpoints)
          .values({ orgId, url: input.url, events: [...new Set(input.events)], secret: sealSecret(secret), createdByMemberId: actingMemberId(actor) })
          .returning({ id: webhookEndpoints.id });
        created = { endpointId: e!.id, secret };
        break;
      }
      case 'setActive':
        await endpoint(input.endpointId);
        await db.update(webhookEndpoints).set({ active: input.active }).where(and(eq(webhookEndpoints.orgId, orgId), eq(webhookEndpoints.id, input.endpointId)));
        break;
      case 'delete':
        await endpoint(input.endpointId);
        await db.delete(webhookEndpoints).where(and(eq(webhookEndpoints.orgId, orgId), eq(webhookEndpoints.id, input.endpointId)));
        break;
      case 'sendTest': {
        const e = await endpoint(input.endpointId);
        if (!e.active) throw new CapabilityError('conflict', 'Resume this webhook before sending a test event.');
        const ids = await emitWebhook(db, orgId, input.event, sampleEventData(input.event), now, { endpointId: e.id });
        await deliverDue(db, now, { orgId, deliveryIds: ids });
        const [d] = await db.select().from(webhookDeliveries).where(and(eq(webhookDeliveries.orgId, orgId), eq(webhookDeliveries.id, ids[0]!)));
        test = { ok: d!.status === 'delivered', statusCode: d!.lastStatusCode, error: d!.lastError };
        break;
      }
      case 'retry': {
        const [d] = await db.select().from(webhookDeliveries).where(and(eq(webhookDeliveries.orgId, orgId), eq(webhookDeliveries.id, input.deliveryId)));
        if (!d) throw new CapabilityError('not_found', 'Delivery not found.');
        if (d.status === 'delivered') throw new CapabilityError('conflict', 'That delivery already succeeded.');
        // A failed delivery gets one more try; a pending one is sent now instead of waiting.
        await db.update(webhookDeliveries).set({ status: 'pending', nextAttemptAt: now, attempts: d.status === 'failed' ? d.attempts - 1 : d.attempts }).where(eq(webhookDeliveries.id, d.id));
        await deliverDue(db, now, { orgId, deliveryIds: [d.id] });
        break;
      }
      case 'list':
        break;
    }

    const eps = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.orgId, orgId)).orderBy(desc(webhookEndpoints.createdAt));
    const log = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.orgId, orgId)).orderBy(desc(webhookDeliveries.createdAt)).limit(50);
    const healthOf = (id: string) => {
      const mine = log.filter((d) => d.endpointId === id && d.status !== 'pending');
      if (!mine.length) return 'new' as const;
      return mine[0]!.status === 'delivered' ? ('healthy' as const) : ('failing' as const);
    };
    const pendingFailing = (id: string) => log.some((d) => d.endpointId === id && d.status === 'pending' && d.attempts > 0);
    return {
      endpoints: eps.map((e) => {
        const last = log.find((d) => d.endpointId === e.id && d.deliveredAt);
        const h = healthOf(e.id);
        return {
          id: e.id,
          url: e.url,
          events: e.events,
          active: e.active,
          createdAt: e.createdAt.toISOString(),
          health: pendingFailing(e.id) && h !== 'failing' ? ('failing' as const) : h,
          lastDeliveredAt: last?.deliveredAt?.toISOString() ?? null,
        };
      }),
      deliveries: log.map((d) => ({
        id: d.id,
        endpointId: d.endpointId,
        event: d.event,
        status: d.status,
        attempts: d.attempts,
        lastStatusCode: d.lastStatusCode,
        lastError: d.lastError,
        nextAttemptAt: d.nextAttemptAt?.toISOString() ?? null,
        createdAt: d.createdAt.toISOString(),
        test: (d.payload as { test?: boolean }).test === true,
      })),
      created,
      test,
    };
  },
});
