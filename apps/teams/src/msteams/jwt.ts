import { createPublicKey, verify } from 'node:crypto';
import { msTeamsAppId, teamsFetch } from './api';

/*
 * Verifies the Bearer token the Bot Connector sends with every activity (Microsoft's "Connector
 * to bot" rules, https://learn.microsoft.com/azure/bot-service/rest-api/bot-framework-rest-connector-authentication):
 *  1. Authorization: Bearer <JWT>, RS256, signed with a key from the Bot Framework JWKS
 *     (found via https://login.botframework.com/v1/.well-known/openidconfiguration);
 *  2. iss = https://api.botframework.com, aud = our Microsoft App ID;
 *  3. exp / nbf within 5 minutes of clock skew;
 *  4. the serviceUrl claim equals the activity's serviceUrl;
 *  5. the signing key endorses the activity's channelId (msteams).
 * Keys are cached for at most 24 hours. There is no way to turn this off.
 */

export const OPENID_URL = 'https://login.botframework.com/v1/.well-known/openidconfiguration';
export const ISSUER = 'https://api.botframework.com';
const SKEW_S = 300;
const KEY_TTL_MS = 24 * 60 * 60 * 1000;

interface Jwk {
  kid: string;
  kty: string;
  n: string;
  e: string;
  endorsements?: string[];
}
let keyCache: { keys: Jwk[]; fetchedAt: number } | null = null;
export function resetTeamsKeyCache(): void {
  keyCache = null;
}

async function signingKeys(now: number, force = false): Promise<Jwk[]> {
  if (!force && keyCache && now - keyCache.fetchedAt < KEY_TTL_MS) return keyCache.keys;
  const meta = (await (await teamsFetch(OPENID_URL, { signal: AbortSignal.timeout(10_000) })).json()) as { jwks_uri?: string };
  if (!meta.jwks_uri || !meta.jwks_uri.startsWith('https://')) throw new Error('Bad OpenID metadata');
  const jwks = (await (await teamsFetch(meta.jwks_uri, { signal: AbortSignal.timeout(10_000) })).json()) as { keys?: Jwk[] };
  keyCache = { keys: jwks.keys ?? [], fetchedAt: now };
  return keyCache.keys;
}

const b64json = (s: string) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8')) as Record<string, unknown>;

export type VerifyResult = { ok: true; claims: Record<string, unknown> } | { ok: false; status: 401 | 403; reason: string };

export async function verifyConnectorToken(
  authorization: string | null,
  activity: { serviceUrl?: string; channelId?: string },
  now = Date.now(),
): Promise<VerifyResult> {
  const appId = msTeamsAppId();
  if (!appId) return { ok: false, status: 401, reason: 'Teams is not configured' };
  const m = /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(authorization ?? '');
  if (!m) return { ok: false, status: 401, reason: 'Missing bearer token' };
  const [, h, p, s] = m as unknown as [string, string, string, string];
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = b64json(h);
    claims = b64json(p);
  } catch {
    return { ok: false, status: 401, reason: 'Malformed token' };
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return { ok: false, status: 401, reason: 'Unexpected algorithm' };

  let key = (await signingKeys(now)).find((k) => k.kid === header.kid);
  if (!key) key = (await signingKeys(now, true)).find((k) => k.kid === header.kid); // key rollover
  if (!key) return { ok: false, status: 401, reason: 'Unknown signing key' };
  const pub = createPublicKey({ key: { kty: key.kty, n: key.n, e: key.e }, format: 'jwk' });
  if (!verify('RSA-SHA256', Buffer.from(`${h}.${p}`), pub, Buffer.from(s, 'base64url'))) return { ok: false, status: 401, reason: 'Bad signature' };

  const nowS = Math.floor(now / 1000);
  if (claims.iss !== ISSUER) return { ok: false, status: 401, reason: 'Wrong issuer' };
  const aud = claims.aud;
  if (!(aud === appId || (Array.isArray(aud) && aud.includes(appId)))) return { ok: false, status: 401, reason: 'Wrong audience' };
  if (typeof claims.exp !== 'number' || claims.exp + SKEW_S < nowS) return { ok: false, status: 401, reason: 'Expired' };
  if (typeof claims.nbf === 'number' && claims.nbf - SKEW_S > nowS) return { ok: false, status: 401, reason: 'Not yet valid' };
  if (!activity.serviceUrl || claims.serviceUrl !== activity.serviceUrl) return { ok: false, status: 401, reason: 'serviceUrl mismatch' };
  if (!activity.channelId || !(key.endorsements ?? []).includes(activity.channelId)) return { ok: false, status: 403, reason: 'Channel not endorsed' };
  return { ok: true, claims };
}
