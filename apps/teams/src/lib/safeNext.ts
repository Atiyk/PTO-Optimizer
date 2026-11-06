/**
 * A post-sign-in redirect target, only if it is a same-site path. Rejects `//host`, `/\host`
 * (URL parsing turns `\` into `/`) and control characters, and re-checks the resolved origin.
 */
export function safeNext(next: string | null | undefined, base: string): string | null {
  if (!next || !next.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(next) || next.startsWith('//')) return null;
  try {
    return new URL(next, base).origin === new URL(base).origin ? next : null;
  } catch {
    return null;
  }
}
