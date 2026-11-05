// The handler is bundled from server/accountEntry.ts by scripts/build-api.mjs during `npm run build`.
// It answers 404 until the environment variables in docs/setup/FREE-EMAIL-AND-SIGNIN.md exist.
// @ts-expect-error: generated file, no type declarations
import { handleRemindRequest } from './_bundle/account.mjs';

export default {
  fetch(request: Request): Promise<Response> {
    return handleRemindRequest(request);
  },
};
