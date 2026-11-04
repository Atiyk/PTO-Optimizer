import { generateICS } from '../src/ui/icsExport';

/** Spike: proves the Vercel Node runtime can import the shared TS modules. Replaced by the real feed. */
export default {
  fetch(_request: Request) {
    const ics = generateICS([], () => false, new Date());
    return new Response(ics, { headers: { 'content-type': 'text/calendar; charset=utf-8' } });
  },
};
