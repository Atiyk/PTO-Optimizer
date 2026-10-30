import { NextResponse } from 'next/server';
import { CapabilityError } from '@/capabilities/errors';

/** Uniform JSON error shape for REST routes. Never leaks internals. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof CapabilityError) return NextResponse.json(err.toJSON(), { status: err.status });
  console.error('unhandled capability error', err instanceof Error ? err.name : 'unknown');
  return NextResponse.json(new CapabilityError('internal', 'Internal error.').toJSON(), { status: 500 });
}
