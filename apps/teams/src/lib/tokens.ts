import { createHash, randomBytes } from 'node:crypto';

/** Opaque random token (shown once) and the hash we store. */
export function newToken(prefix: string): { token: string; hash: string } {
  const token = `${prefix}_${randomBytes(24).toString('base64url')}`;
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
