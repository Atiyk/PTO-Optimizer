// Spike entry, replaced at integration by the real feed handler.
import { generateICS } from '../src/ui/icsExport';
export function handle(): Response {
  return new Response(generateICS([], () => false, new Date()), { headers: { 'content-type': 'text/calendar; charset=utf-8' } });
}
