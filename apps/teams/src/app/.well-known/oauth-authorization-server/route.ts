import { NextResponse } from 'next/server';
import { SCOPES } from '@/capabilities/scopes';
import { appUrl } from '@/lib/appUrl';

/** RFC 8414 metadata. Stage 1: client credentials only (see docs/teams/AGENT-AUTH.md for Stage 2). */
export function GET() {
  const base = appUrl();
  return NextResponse.json(
    {
      issuer: base,
      token_endpoint: `${base}/api/oauth/token`,
      grant_types_supported: ['client_credentials'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
      scopes_supported: SCOPES,
      service_documentation: `${base}/developers`,
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } },
  );
}
