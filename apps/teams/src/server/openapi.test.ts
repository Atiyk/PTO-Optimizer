import { describe, expect, it } from 'vitest';
import { buildOpenApi } from './openapi';

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
});
