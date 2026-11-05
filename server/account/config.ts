/**
 * Optional account features (email reminders, sign-in, "forward the approval"). Every one is
 * off until its environment variables exist, so the free site deploys and runs without them.
 * The variable names and the free services behind them are in docs/setup/FREE-EMAIL-AND-SIGNIN.md.
 */
export interface AccountConfig {
  /** Gmail address that sends mail (GMAIL_USER) and its 16-character app password. */
  gmailUser: string | null;
  gmailAppPassword: string | null;
  fromName: string;
  /** Postgres connection string (Neon injects DATABASE_URL; POSTGRES_URL is accepted too). */
  databaseUrl: string | null;
  /** Signs sign-in links, session cookies and unsubscribe links. At least 32 characters. */
  appSecret: string | null;
  /** Vercel sends it as "Authorization: Bearer <CRON_SECRET>" to the daily reminder job. */
  cronSecret: string | null;
  /** Secret in the inbound webhook URL (?key=...) and the address people forward to. */
  inboundSecret: string | null;
  inboundAddress: string | null;
  /** Public site URL for links in emails, e.g. https://pto-optimizer-seven.vercel.app. */
  appUrl: string | null;
  /** Stays under Gmail's ~500 recipients a day for personal accounts. */
  dailyEmailCap: number;
}

type Env = Record<string, string | undefined>;

function value(env: Env, name: string): string | null {
  const raw = env[name]?.trim();
  return raw ? raw : null;
}

export function readAccountConfig(env: Env = process.env): AccountConfig {
  const cap = Number(value(env, 'DAILY_EMAIL_CAP') ?? '400');
  return {
    gmailUser: value(env, 'GMAIL_USER'),
    // Google shows app passwords in groups of four ("abcd efgh ijkl mnop"); spaces are not part of it.
    gmailAppPassword: value(env, 'GMAIL_APP_PASSWORD')?.replace(/\s+/g, '') || null,
    fromName: value(env, 'MAIL_FROM_NAME') ?? 'Gapless',
    databaseUrl: value(env, 'DATABASE_URL') ?? value(env, 'POSTGRES_URL'),
    appSecret: value(env, 'APP_SECRET'),
    cronSecret: value(env, 'CRON_SECRET'),
    inboundSecret: value(env, 'INBOUND_SECRET'),
    inboundAddress: value(env, 'INBOUND_ADDRESS'),
    // Unset: links use the address the request came in on, so previews link to themselves.
    appUrl: value(env, 'APP_URL')?.replace(/\/$/, '') ?? null,
    dailyEmailCap: Number.isFinite(cap) && cap > 0 ? Math.floor(cap) : 400,
  };
}

export interface FeatureFlags {
  /** Gmail credentials exist, so the app can send mail. */
  email: boolean;
  /** Email plus a database and a signing secret: sign-in and email reminders. */
  accounts: boolean;
  /** Accounts plus an inbound secret and address: "forward the approval". */
  inbound: boolean;
}

export function featureFlags(config: AccountConfig): FeatureFlags {
  const email = Boolean(config.gmailUser && config.gmailAppPassword);
  const accounts = email && Boolean(config.databaseUrl) && (config.appSecret?.length ?? 0) >= 32;
  const inbound = accounts && Boolean(config.inboundSecret && config.inboundAddress);
  return { email, accounts, inbound };
}

/** Names (never values) of the settings still missing, so the owner can see why a feature is off. */
export function missingSettings(config: AccountConfig): string[] {
  const missing: string[] = [];
  if (!config.gmailUser) missing.push('GMAIL_USER');
  if (!config.gmailAppPassword) missing.push('GMAIL_APP_PASSWORD');
  if (!config.databaseUrl) missing.push('DATABASE_URL');
  if ((config.appSecret?.length ?? 0) < 32) missing.push('APP_SECRET (32+ characters)');
  if (!config.cronSecret) missing.push('CRON_SECRET');
  if (!config.inboundSecret) missing.push('INBOUND_SECRET');
  if (!config.inboundAddress) missing.push('INBOUND_ADDRESS');
  return missing;
}
