import { llmsTxt } from '@/server/discovery';
import { appUrl } from '@/lib/appUrl';

export const dynamic = 'force-dynamic';

export function GET(req: Request) {
  return new Response(llmsTxt(appUrl(new URL(req.url).origin)), {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}
