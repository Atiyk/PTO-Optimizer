import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

/**
 * The only personal data the consumer app stores (docs/personal/DATA.md): an email address,
 * the plan and policy links the person chose to save, and whether they want reminder emails.
 * Tables are created on first use, so setup needs no SQL console. Deleting the account
 * removes the row and nothing else refers to it.
 */
export interface AccountRow {
  id: string;
  email: string;
  plan_link: string | null;
  policy_link: string | null;
  reminders: boolean;
  last_reminded_on: string | null;
}

export interface AccountStore {
  findOrCreate(email: string): Promise<AccountRow>;
  byId(id: string): Promise<AccountRow | null>;
  byEmail(email: string): Promise<AccountRow | null>;
  save(id: string, fields: { planLink?: string | null; policyLink?: string | null; reminders?: boolean }): Promise<AccountRow | null>;
  remove(id: string): Promise<void>;
  /** Accounts with reminders on that haven't been sent today's digest yet. */
  dueForReminders(today: string, limit: number): Promise<AccountRow[]>;
  markReminded(id: string, today: string): Promise<void>;
  /** Counts one email against today's cap; false when the cap is reached. */
  takeEmailBudget(today: string, cap: number): Promise<boolean>;
  /** False when a sign-in link went to this address in the last two minutes. */
  takeLoginSlot(email: string, nowMs: number): Promise<boolean>;
  /**
   * Counts one use of `key` in a fixed window; false once `limit` uses fall in the current
   * window. Keys are hashed before they are stored, so no address or IP is kept.
   */
  takeRateSlot(key: string, limit: number, windowMs: number, nowMs: number): Promise<boolean>;
}

const COLUMNS = 'id, email, plan_link, policy_link, reminders, last_reminded_on::text AS last_reminded_on';

export function neonStore(databaseUrl: string): AccountStore {
  const sql = neon(databaseUrl);
  let ready: Promise<unknown> | null = null;
  const schema = () => (ready ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS gapless_accounts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      email text NOT NULL UNIQUE,
      plan_link text,
      policy_link text,
      reminders boolean NOT NULL DEFAULT false,
      last_reminded_on date,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS gapless_mail_budget (day date PRIMARY KEY, sent integer NOT NULL DEFAULT 0)`;
    // Keyed by a hash, so asking for a sign-in link stores no address until the link is used.
    await sql`CREATE TABLE IF NOT EXISTS gapless_login_throttle (email_hash text PRIMARY KEY, sent_at timestamptz NOT NULL)`;
    await sql`CREATE TABLE IF NOT EXISTS gapless_rate_limit (key_hash text PRIMARY KEY, window_start timestamptz NOT NULL, used integer NOT NULL)`;
  })().catch((error) => { ready = null; throw error; }));
  const one = (rows: unknown[]) => (rows[0] as AccountRow | undefined) ?? null;

  return {
    async findOrCreate(email) {
      await schema();
      return one(await sql.query(`INSERT INTO gapless_accounts (email) VALUES ($1)
        ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING ${COLUMNS}`, [email]))!;
    },
    async byId(id) {
      await schema();
      if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
      return one(await sql.query(`SELECT ${COLUMNS} FROM gapless_accounts WHERE id = $1`, [id]));
    },
    async byEmail(email) {
      await schema();
      return one(await sql.query(`SELECT ${COLUMNS} FROM gapless_accounts WHERE email = $1`, [email]));
    },
    async save(id, fields) {
      await schema();
      return one(await sql.query(`UPDATE gapless_accounts SET
          plan_link = CASE WHEN $2 THEN $3 ELSE plan_link END,
          policy_link = CASE WHEN $4 THEN $5 ELSE policy_link END,
          reminders = COALESCE($6, reminders)
        WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, fields.planLink !== undefined, fields.planLink ?? null, fields.policyLink !== undefined, fields.policyLink ?? null, fields.reminders ?? null]));
    },
    async remove(id) {
      await schema();
      await sql.query('DELETE FROM gapless_accounts WHERE id = $1', [id]);
    },
    async dueForReminders(today, limit) {
      await schema();
      return (await sql.query(`SELECT ${COLUMNS} FROM gapless_accounts
        WHERE reminders AND (plan_link IS NOT NULL OR policy_link IS NOT NULL)
          AND (last_reminded_on IS NULL OR last_reminded_on < $1::date)
        ORDER BY id LIMIT $2`, [today, limit])) as AccountRow[];
    },
    async markReminded(id, today) {
      await schema();
      await sql.query('UPDATE gapless_accounts SET last_reminded_on = $2::date WHERE id = $1', [id, today]);
    },
    async takeEmailBudget(today, cap) {
      await schema();
      const rows = await sql.query(`INSERT INTO gapless_mail_budget (day, sent) VALUES ($1::date, 1)
        ON CONFLICT (day) DO UPDATE SET sent = gapless_mail_budget.sent + 1
        WHERE gapless_mail_budget.sent < $2 RETURNING sent`, [today, cap]);
      return rows.length > 0;
    },
    async takeLoginSlot(email, nowMs) {
      await schema();
      const hash = createHash('sha256').update(email).digest('hex');
      await sql.query(`DELETE FROM gapless_login_throttle WHERE sent_at < to_timestamp($1 / 1000.0) - interval '1 day'`, [nowMs]);
      const rows = await sql.query(`INSERT INTO gapless_login_throttle (email_hash, sent_at) VALUES ($1, to_timestamp($2 / 1000.0))
        ON CONFLICT (email_hash) DO UPDATE SET sent_at = EXCLUDED.sent_at
        WHERE gapless_login_throttle.sent_at < EXCLUDED.sent_at - interval '2 minutes' RETURNING email_hash`, [hash, nowMs]);
      return rows.length > 0;
    },
    async takeRateSlot(key, limit, windowMs, nowMs) {
      await schema();
      const hash = createHash('sha256').update(key).digest('hex');
      await sql.query(`DELETE FROM gapless_rate_limit WHERE window_start < to_timestamp($1 / 1000.0) - interval '2 days'`, [nowMs]);
      // A new window starts once the old one is over; otherwise count up while under the limit.
      const rows = await sql.query(`INSERT INTO gapless_rate_limit (key_hash, window_start, used) VALUES ($1, to_timestamp($2 / 1000.0), 1)
        ON CONFLICT (key_hash) DO UPDATE SET
          window_start = CASE WHEN gapless_rate_limit.window_start <= to_timestamp(($2 - $3) / 1000.0) THEN EXCLUDED.window_start ELSE gapless_rate_limit.window_start END,
          used = CASE WHEN gapless_rate_limit.window_start <= to_timestamp(($2 - $3) / 1000.0) THEN 1 ELSE gapless_rate_limit.used + 1 END
        WHERE gapless_rate_limit.window_start <= to_timestamp(($2 - $3) / 1000.0) OR gapless_rate_limit.used < $4
        RETURNING used`, [hash, nowMs, windowMs, limit]);
      return rows.length > 0;
    },
  };
}
