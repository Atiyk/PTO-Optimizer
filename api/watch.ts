// The handler is bundled from server/feedEntry.ts by scripts/build-api.mjs during `npm run build`.
// @ts-expect-error: generated file, no type declarations
import { handleWatch } from './_bundle/feed.mjs';

export default {
  fetch(request: Request): Promise<Response> {
    return handleWatch(request);
  },
};
