import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { dbMode, getDb, MIGRATIONS_DIR, type DbMode } from '@/db/client';

/*
 * What /status and /api/health show: how this deployment stores data, whether the database
 * schema is current, and which integrations are configured. Booleans only, never a value.
 */

export interface HealthReport {
  ok: boolean;
  mode: DbMode;
  database: { reachable: boolean; migrationsApplied: number | null; migrationsTotal: number; current: boolean; error?: string };
  configured: Record<ConfigKey, boolean>;
}

type ConfigKey = 'sessionSecret' | 'appUrl' | 'slackSignIn' | 'slackApp' | 'cronSecret' | 'webPush' | 'sms' | 'ai';

export const CONFIG_LABELS: Record<ConfigKey, [label: string, needed: string]> = {
  sessionSecret: ['Session secret', 'SESSION_SECRET. Required once a database is connected.'],
  appUrl: ['Public URL', 'APP_URL. Needed for passkeys and Slack redirects on a custom domain.'],
  slackSignIn: ['Sign in with Slack', 'SLACK_CLIENT_ID and SLACK_CLIENT_SECRET.'],
  slackApp: ['Slack app (commands and messages)', 'SLACK_SIGNING_SECRET, plus the two above.'],
  cronSecret: ['Daily job', 'CRON_SECRET, and a scheduler calling /api/cron/daily.'],
  webPush: ['Phone notifications', 'VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT.'],
  sms: ['Text messages', 'MESSAGING_PROVIDER=twilio and the TWILIO_* settings. Optional.'],
  ai: ['AI features', 'ANTHROPIC_API_KEY. Optional; every form works without it.'],
};

const has = (...keys: string[]) => keys.every((k) => !!process.env[k]);

export async function healthReport(): Promise<HealthReport> {
  const mode = dbMode();
  const journal = JSON.parse(await readFile(path.join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8')) as { entries: unknown[] };
  const migrationsTotal = journal.entries.length;
  const database: HealthReport['database'] = { reachable: false, migrationsApplied: null, migrationsTotal, current: false };
  try {
    const db = await getDb();
    const rows = (await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`)) as unknown as { n: number }[] | { rows: { n: number }[] };
    const n = Array.isArray(rows) ? rows[0]?.n : rows.rows[0]?.n;
    database.reachable = true;
    database.migrationsApplied = Number(n ?? 0);
    database.current = database.migrationsApplied >= migrationsTotal;
  } catch (e) {
    // The message names the failing step, never the connection string.
    database.error = e instanceof Error ? e.message.replace(/postgres(ql)?:\/\/\S+/g, '[database url]').slice(0, 200) : 'unknown error';
  }
  const configured: Record<ConfigKey, boolean> = {
    sessionSecret: has('SESSION_SECRET'),
    appUrl: has('APP_URL'),
    slackSignIn: has('SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET'),
    slackApp: has('SLACK_CLIENT_ID', 'SLACK_CLIENT_SECRET', 'SLACK_SIGNING_SECRET'),
    cronSecret: has('CRON_SECRET'),
    webPush: has('VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'),
    sms: process.env.MESSAGING_PROVIDER === 'twilio' && has('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM'),
    ai: has('ANTHROPIC_API_KEY'),
  };
  const ok = database.reachable && database.current && (mode !== 'postgres' || configured.sessionSecret);
  return { ok, mode, database, configured };
}
