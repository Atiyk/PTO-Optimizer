import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET as llms } from '@/app/llms.txt/route';
import { GET as card } from '@/app/.well-known/agent-card.json/route';
import { POST as a2a } from '@/app/api/a2a/route';
import { agentTools } from './discovery';

afterEach(() => vi.unstubAllEnvs());

describe('discovery (5E)', () => {
  it('llms.txt follows the llmstxt.org shape and lists every MCP tool', async () => {
    const text = await (await llms(new Request('https://teams.example.com/llms.txt'))).text();
    expect(text.split('\n')[0]).toBe('# Gapless');
    expect(text).toMatch(/^> /m);
    expect(text).toContain('## Tools');
    for (const t of agentTools()) expect(text).toContain(`\`${t.name}\``);
    expect(text).not.toContain('manageAgentAccess'); // UI-only actions are not advertised
    expect(text).toContain('/api/v1/openapi.json');
  });

  it('the A2A card and endpoint exist only behind A2A_ENABLED', async () => {
    expect((await card(new Request('https://teams.example.com/.well-known/agent-card.json'))).status).toBe(404);
    expect((await a2a(new Request('https://teams.example.com/api/a2a', { method: 'POST', body: '{}' }))).status).toBe(404);
    vi.stubEnv('A2A_ENABLED', '1');
    const c = await (await card(new Request('https://teams.example.com/.well-known/agent-card.json'))).json();
    expect(c).toMatchObject({ name: 'Gapless', supportedInterfaces: [{ protocolBinding: 'JSONRPC', protocolVersion: '1.0' }] });
    expect(c.skills.length).toBeGreaterThan(0);
    expect(c).not.toHaveProperty('protocolVersion'); // 0.3-era top-level field
    const r = await (await a2a(new Request('https://teams.example.com/api/a2a', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'SendMessage' }) }))).json();
    expect(r).toMatchObject({ jsonrpc: '2.0', id: 7, error: { code: -32601 } });
  });
});
