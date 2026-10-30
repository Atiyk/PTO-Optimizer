import { NextResponse, type NextRequest } from 'next/server';
import { errorResponse } from '@/lib/http';
import { SESSION_COOKIE } from '@/lib/session';
import { runForSession } from '@/server/run';

export async function GET(request: NextRequest) {
  try {
    const leaveType = request.nextUrl.searchParams.get('leaveType') ?? undefined;
    const data = await runForSession('getMyBalance', request.cookies.get(SESSION_COOKIE)?.value, { leaveType });
    return NextResponse.json({ data });
  } catch (err) {
    return errorResponse(err);
  }
}
