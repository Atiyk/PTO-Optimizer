/*
 * Microsoft Teams (Bot Framework) transport over fetch, no SDK. Tests swap the transport with
 * setTeamsTransport and assert on the calls; nothing is ever sent for real in tests.
 *
 * Outgoing auth (bot → Bot Connector): OAuth client credentials against Microsoft Entra ID with
 * scope https://api.botframework.com/.default. Single-tenant bots use their tenant's token
 * endpoint (MSTEAMS_TENANT_ID); multi-tenant bots created before 2025-07-31 use botframework.com.
 */

type Fetch = typeof fetch;
let transport: Fetch | null = null;
export function setTeamsTransport(f: Fetch | null): void {
  transport = f;
  cachedToken = null;
}
export const teamsFetch: Fetch = (...a) => (transport ?? fetch)(...a);

export const msTeamsAppId = () => process.env.MSTEAMS_APP_ID ?? '';
export const msTeamsConfigured = () => !!(process.env.MSTEAMS_APP_ID && process.env.MSTEAMS_APP_PASSWORD);

export class TeamsApiError extends Error {
  constructor(
    public what: string,
    public status: number,
  ) {
    super(`Teams ${what} failed: HTTP ${status}`);
  }
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function botToken(now = Date.now()): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 5 * 60_000 > now) return cachedToken.token;
  const tenant = process.env.MSTEAMS_TENANT_ID || 'botframework.com';
  const res = await teamsFetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: msTeamsAppId(),
      client_secret: process.env.MSTEAMS_APP_PASSWORD ?? '',
      scope: 'https://api.botframework.com/.default',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new TeamsApiError('token', res.status);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return data.access_token;
}

/** Only https service URLs (the Bot Connector's), never a user-controlled host or plain http. */
function base(serviceUrl: string): string {
  const u = new URL(serviceUrl);
  if (u.protocol !== 'https:') throw new Error('Unexpected Teams serviceUrl');
  return u.toString().replace(/\/$/, '');
}

async function connector<T>(method: string, serviceUrl: string, path: string, body?: unknown): Promise<T> {
  const res = await teamsFetch(`${base(serviceUrl)}${path}`, {
    method,
    headers: { authorization: `Bearer ${await botToken()}`, 'content-type': 'application/json; charset=utf-8' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new TeamsApiError(`${method} ${path.split('/').slice(0, 4).join('/')}`, res.status);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export type OutActivity = { type: 'message'; text?: string; textFormat?: 'markdown' | 'plain'; attachments?: unknown[] };

export const sendActivity = (serviceUrl: string, conversationId: string, activity: OutActivity) =>
  connector<{ id?: string }>('POST', serviceUrl, `/v3/conversations/${encodeURIComponent(conversationId)}/activities`, activity);

export const updateActivity = (serviceUrl: string, conversationId: string, activityId: string, activity: OutActivity) =>
  connector<{ id?: string }>('PUT', serviceUrl, `/v3/conversations/${encodeURIComponent(conversationId)}/activities/${encodeURIComponent(activityId)}`, { ...activity, id: activityId });

/** A conversation member's profile (email / UPN), to link the Teams user to a Days Off member. */
export const getConversationMember = (serviceUrl: string, conversationId: string, userId: string) =>
  connector<{ id: string; aadObjectId?: string; email?: string; userPrincipalName?: string; name?: string }>(
    'GET',
    serviceUrl,
    `/v3/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(userId)}`,
  );
