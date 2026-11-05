/**
 * Server entry for the optional account features, bundled into api/_bundle/account.mjs by
 * scripts/build-api.mjs. Everything stays off until the environment variables in
 * docs/setup/FREE-EMAIL-AND-SIGNIN.md exist.
 */
import { readAccountConfig } from './account/config';
import { neonStore, type AccountStore } from './account/db';
import { handleAccount, handleInbound, handleRemind, type AccountDeps } from './account/handlers';
import { gmailSender, type SendMail } from './account/mailer';
import { handleFeed, handleWatch } from './feedEntry';

let store: AccountStore | null = null;
let send: SendMail | null = null;

async function ics(response: Promise<Response>): Promise<string | null> {
  const res = await response;
  return res.ok ? res.text() : null;
}

function deps(): AccountDeps {
  const config = readAccountConfig();
  return {
    config,
    store: () => (store ??= neonStore(config.databaseUrl!)),
    send: () => (send ??= gmailSender(config)),
    feeds: {
      plan: (query) => ics(handleFeed(new Request(`https://feeds.internal/api/feed?${query}`))),
      watch: (query) => ics(handleWatch(new Request(`https://feeds.internal/api/watch?${query}`))),
    },
  };
}

function guarded(handler: (request: Request, d: AccountDeps) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      return await handler(request, deps());
    } catch (error) {
      console.error('account handler failed', error instanceof Error ? error.message : error);
      return new Response(JSON.stringify({ error: 'Something went wrong. Try again in a minute.' }), {
        status: 500, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
  };
}

export const handleAccountRequest = guarded(handleAccount);
export const handleRemindRequest = guarded(handleRemind);
export const handleInboundRequest = guarded(handleInbound);
