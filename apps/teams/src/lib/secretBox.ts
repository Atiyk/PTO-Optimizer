import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/*
 * Secrets we must be able to read back (webhook signing secrets, Slack tokens), sealed with
 * AES-256-GCM under a key derived from SESSION_SECRET. Format: enc:v1:<iv>:<tag>:<ciphertext>.
 */

function key(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set');
  return Buffer.from(hkdfSync('sha256', s, 'daysoff-teams', 'webhook-secrets', 32));
}

export function sealSecret(secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(secret, 'utf8'), c.final()]);
  return `enc:v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}

export function openSecret(stored: string): string {
  const [, , iv, tag, ct] = stored.split(':');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv!, 'base64'));
  d.setAuthTag(Buffer.from(tag!, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct!, 'base64')), d.final()]).toString('utf8');
}
