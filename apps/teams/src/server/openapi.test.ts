import { describe, expect, it } from 'vitest';
import { WEBHOOK_EVENTS } from '@/db/schema';
import { buildOpenApi } from './openapi';
import { WEBHOOK_DATA } from './webhookSchemas';
import { sampleEventData } from './webhooks';

describe('OpenAPI from the registry', () => {
  it('has one operation per REST capability, with schemas and the confirmation response on commits', () => {
    const doc = buildOpenApi('https://example.test');
    const ops = Object.values(doc.paths) as Array<{ post: { operationId: string; responses: Record<string, unknown>; requestBody?: unknown } }>;
    expect(ops.length).toBeGreaterThan(15);
    const submit = (doc.paths['/api/v1/actions/submitLeaveRequest'] as { post: { responses: Record<string, unknown>; 'x-effect': string } }).post;
    expect(submit['x-effect']).toBe('commit');
    expect(submit.responses['202']).toBeTruthy();
    expect(JSON.stringify(doc)).toContain('idempotencyKey');
    expect(new Set(ops.map((o) => o.post.operationId)).size).toBe(ops.length);
  });

  it('lists the coverage capabilities and every webhook event with its payload schema', () => {
    const doc = buildOpenApi('https://example.test') as ReturnType<typeof buildOpenApi> & { webhooks: Record<string, any> };
    for (const op of ['getCoverage', 'getCoverageForecast', 'findCover', 'requestCover', 'respondToCover', 'reportCallOff', 'getCoverRequests', 'manageSchedule', 'manageCredentials', 'draftRulePackFromText']) {
      expect(doc.paths[`/api/v1/actions/${op}`], op).toBeTruthy();
    }
    expect(Object.keys(doc.webhooks).sort()).toEqual([...WEBHOOK_EVENTS].sort());
    const gap = doc.webhooks['coverage.gap_detected'].post.requestBody.content['application/json'].schema;
    expect(gap.properties.data.properties.rule.properties.citation).toBeTruthy();
  });

  it('sample webhook bodies match the published schemas exactly', () => {
    for (const e of WEBHOOK_EVENTS) {
      const sample = sampleEventData(e);
      expect(WEBHOOK_DATA[e].parse(sample), e).toEqual(sample); // parse strips unknown keys: equal means none
    }
  });
});
