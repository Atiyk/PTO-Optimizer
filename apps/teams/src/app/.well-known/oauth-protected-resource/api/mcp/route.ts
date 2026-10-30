import { NextResponse } from 'next/server';
import { SCOPES } from '@/capabilities/scopes';
import { appUrl } from '@/lib/appUrl';
import { mcpResourceUrl } from '@/lib/resourceMetadata';

/**
 * RFC 9728 protected-resource metadata for the MCP server. Stage 1 issues tokens itself
 * (personal tokens, API keys, client credentials at /api/oauth/token); the authorization
 * server listed here is this app's token endpoint issuer. Stage 2 (authorization code +
 * PKCE) is designed in docs/teams/AGENT-AUTH.md.
 */
export function GET() {
  return NextResponse.json(
    {
      resource: mcpResourceUrl(),
      authorization_servers: [appUrl()],
      scopes_supported: SCOPES,
      bearer_methods_supported: ['header'],
      resource_name: 'Days Off for Teams MCP server',
      resource_documentation: `${appUrl()}/docs/agents`,
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
