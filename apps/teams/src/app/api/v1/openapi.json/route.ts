import { NextResponse } from 'next/server';
import { appUrl } from '@/lib/appUrl';
import { buildOpenApi } from '@/server/openapi';

export function GET() {
  return NextResponse.json(buildOpenApi(appUrl()), { headers: { 'Cache-Control': 'public, max-age=300' } });
}
