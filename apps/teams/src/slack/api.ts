/*
 * The few Slack Web API calls we make, over fetch (no SDK). Tests swap the transport with
 * setSlackTransport and assert on the calls.
 */

type Fetch = typeof fetch;
let transport: Fetch | null = null;
export function setSlackTransport(f: Fetch | null): void {
  transport = f;
}
const doFetch: Fetch = (...a) => (transport ?? fetch)(...a);

export class SlackApiError extends Error {
  constructor(public method: string, public slackError: string) {
    super(`Slack ${method} failed: ${slackError}`);
  }
}

/** POST a JSON body to a Web API method with a bot or user token. */
export async function slackApi<T = Record<string, unknown>>(method: string, token: string, body: Record<string, unknown>): Promise<T> {
  const res = await doFetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json()) as { ok: boolean; error?: string } & T;
  if (!data.ok) throw new SlackApiError(method, data.error ?? `http_${res.status}`);
  return data;
}

/** OAuth code exchange (form-encoded with client credentials). */
export async function slackOAuthAccess(code: string, redirectUri: string): Promise<Record<string, any>> {
  const res = await doFetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, redirect_uri: redirectUri, client_id: process.env.SLACK_CLIENT_ID ?? '', client_secret: process.env.SLACK_CLIENT_SECRET ?? '' }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json()) as Record<string, any>;
  if (!data.ok) throw new SlackApiError('oauth.v2.access', String(data.error ?? res.status));
  return data;
}

/** Reply through an interaction's or command's response_url (valid 30 minutes, 5 uses). */
export async function respond(responseUrl: string, message: Record<string, unknown>): Promise<void> {
  if (!/^https:\/\/hooks\.slack\.com\//.test(responseUrl)) throw new Error('Unexpected response_url host');
  await doFetch(responseUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(message), signal: AbortSignal.timeout(10_000) });
}
