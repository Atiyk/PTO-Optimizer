import { a2aEnabled } from '@/server/discovery';

/*
 * A2A stub. The card advertises this endpoint so the shape can be tested end to end, but tasks
 * are not implemented yet: every call gets a JSON-RPC "method not found" pointing at MCP.
 */
export async function POST(req: Request) {
  if (!a2aEnabled()) return Response.json({ error: 'Not found.' }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  return Response.json({
    jsonrpc: '2.0',
    id: body?.id ?? null,
    error: { code: -32601, message: 'A2A tasks are not available yet. Use the MCP endpoint at /api/mcp; see /developers.' },
  });
}
