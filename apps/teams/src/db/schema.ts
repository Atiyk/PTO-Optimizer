import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/*
 * The domain model from docs/teams/SPEC.md §2.
 *
 * Tenant isolation: every business table carries org_id, and every query in
 * src/capabilities filters by the caller's org (see docs/teams/ARCHITECTURE.md).
 * Balances are never stored: they are derived by packages/engine from balance_ledger.
 */

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const orgRef = () =>
  uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' });

export const ROLES = ['owner', 'admin', 'manager', 'employee'] as const;
export const ACTOR_TYPES = ['human', 'agent-on-behalf-of-user', 'service-agent'] as const;
export const REQUEST_STATUSES = ['draft', 'pending', 'approved', 'declined', 'cancelled'] as const;
export const LEDGER_KINDS = ['accrual', 'usage', 'adjustment', 'carryover', 'forfeiture', 'import'] as const;

export const organizations = pgTable('organizations', {
  id: id(),
  name: text('name').notNull(),
  slug: text('slug').unique(),
  /** Days Off convention: 1 = Monday-first weeks, 0 = Sunday-first. */
  weekStart: smallint('week_start').notNull().default(1),
  /** Health-data minimisation: off by default (SPEC §5). */
  sickNotesEnabled: boolean('sick_notes_enabled').notNull().default(false),
  /** SPEC §4: org | team | custom. */
  visibility: text('visibility', { enum: ['org', 'team', 'custom'] }).notNull().default('org'),
  /** Show the leave type to colleagues; health-related types always show as "Out". */
  showLeaveType: boolean('show_leave_type').notNull().default(false),
  /** Admin kill switch for every agent token in the org (A12). */
  agentAccessEnabled: boolean('agent_access_enabled').notNull().default(true),
  /** The shared, read-only sample org behind the public demo (/demo). */
  isDemo: boolean('is_demo').notNull().default(false),
  /** Minutes an auto-approval stays reversible by the manager. */
  autoApprovalReversibleMinutes: integer('auto_approval_reversible_minutes').notNull().default(48 * 60),
  /** Regulated coverage (COVERAGE-SPEC): `general` = MVP behaviour, unchanged. */
  vertical: text('vertical', { enum: ['general', 'childcare', 'clinic'] }).notNull().default('general'),
  /** Pay rates are stored only while this is on (COVERAGE-SPEC §6). */
  costAwareRanking: boolean('cost_aware_ranking').notNull().default(false),
  /** Health-data minimisation: call-off reasons are not stored unless enabled. */
  callOffReasonsEnabled: boolean('call_off_reasons_enabled').notNull().default(false),
  createdAt: createdAt(),
});

export const locations = pgTable(
  'locations',
  {
    id: id(),
    orgId: orgRef(),
    name: text('name').notNull(),
    countryCode: text('country_code').notNull(),
    subdivisionCode: text('subdivision_code'),
    timezone: text('timezone').notNull().default('UTC'),
    createdAt: createdAt(),
  },
  (t) => [index('locations_org_idx').on(t.orgId)],
);

/** Org-defined closures on top of the engine's public holidays (e.g. office shutdown). */
export const extraClosures = pgTable(
  'extra_closures',
  {
    id: id(),
    orgId: orgRef(),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    name: text('name').notNull(),
  },
  (t) => [index('closures_org_idx').on(t.orgId)],
);

export const teams = pgTable(
  'teams',
  {
    id: id(),
    orgId: orgRef(),
    name: text('name').notNull(),
    parentTeamId: uuid('parent_team_id'),
    createdAt: createdAt(),
  },
  (t) => [index('teams_org_idx').on(t.orgId)],
);

export const members = pgTable(
  'members',
  {
    id: id(),
    orgId: orgRef(),
    name: text('name').notNull(),
    email: text('email'),
    slackUserId: text('slack_user_id'),
    role: text('role', { enum: ROLES }).notNull().default('employee'),
    /** 7 chars, Monday first: '1111100' = Mon–Fri (same convention as the engine's WorkWeek). */
    workWeek: text('work_week').notNull().default('1111100'),
    hoursPerDay: numeric('hours_per_day', { precision: 5, scale: 2 }).notNull().default('8'),
    startDate: date('start_date'),
    endDate: date('end_date'),
    locationId: uuid('location_id').references(() => locations.id, { onDelete: 'set null' }),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
    managerId: uuid('manager_id'),
    /** Free-form tags for role-based coverage, e.g. 'engineer'. */
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Hourly staff accrue sick leave from imported hours worked. */
    employmentType: text('employment_type', { enum: ['salaried', 'hourly'] }).notNull().default('salaried'),
    createdAt: createdAt(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('members_org_idx').on(t.orgId),
    uniqueIndex('members_org_slack_idx').on(t.orgId, t.slackUserId),
  ],
);

/** Location history so holidays follow the location in force on each day (SPEC §6). */
export const memberLocationHistory = pgTable(
  'member_location_history',
  {
    id: id(),
    orgId: orgRef(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    effectiveFrom: date('effective_from').notNull(),
  },
  (t) => [index('mlh_member_idx').on(t.orgId, t.memberId)],
);

export const leaveTypes = pgTable(
  'leave_types',
  {
    id: id(),
    orgId: orgRef(),
    /** vacation | sick | personal | unpaid | parental | custom-* */
    key: text('key').notNull(),
    name: text('name').notNull(),
    paid: boolean('paid').notNull().default(true),
    countsAgainstBalance: boolean('counts_against_balance').notNull().default(true),
    requiresApproval: boolean('requires_approval').notNull().default(true),
    /** Drives health-data minimisation (SPEC §5). */
    isHealthRelated: boolean('is_health_related').notNull().default(false),
    autoApprove: boolean('auto_approve').notNull().default(false),
    maxAutoApproveDays: numeric('max_auto_approve_days', { precision: 6, scale: 2 }),
    archived: boolean('archived').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('leave_types_org_key_idx').on(t.orgId, t.key)],
);

/**
 * The policy model (SPEC §3) as engine-shaped JSON, validated by the engine's policy schema
 * before insert. `citations` maps field path → quoted source sentence or "not stated".
 * New rows with a later effective_from supersede old ones going forward only.
 */
export const leavePolicies = pgTable(
  'leave_policies',
  {
    id: id(),
    orgId: orgRef(),
    leaveTypeId: uuid('leave_type_id')
      .notNull()
      .references(() => leaveTypes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** { all: true } | { teamIds: [...] } | { locationIds: [...] } */
    appliesTo: jsonb('applies_to').notNull().default({ all: true }),
    effectiveFrom: date('effective_from').notNull(),
    policy: jsonb('policy').notNull(),
    citations: jsonb('citations'),
    createdAt: createdAt(),
  },
  (t) => [index('policies_org_type_idx').on(t.orgId, t.leaveTypeId)],
);

export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: id(),
    orgId: orgRef(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    leaveTypeId: uuid('leave_type_id')
      .notNull()
      .references(() => leaveTypes.id),
    status: text('status', { enum: REQUEST_STATUSES }).notNull().default('pending'),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    part: text('part', { enum: ['full', 'am', 'pm', 'hours'] }).notNull().default('full'),
    hours: numeric('hours', { precision: 6, scale: 2 }),
    /** Never stored for health-related types unless the org enabled sick notes. */
    note: text('note'),
    /** Engine snapshot at submit: deducted amount, unit, holidays excluded, etc. */
    engineSnapshot: jsonb('engine_snapshot'),
    createdByActorType: text('created_by_actor_type', { enum: ACTOR_TYPES }).notNull().default('human'),
    createdByClientId: text('created_by_client_id'),
    decidedByMemberId: uuid('decided_by_member_id'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    autoApproved: boolean('auto_approved').notNull().default(false),
    autoApprovalReason: text('auto_approval_reason'),
    reversibleUntil: timestamp('reversible_until', { withTimezone: true }),
    replacesRequestId: uuid('replaces_request_id'),
    idempotencyKey: text('idempotency_key'),
    /** `call_off`: created by reportCallOff (no reason stored by default). */
    source: text('source', { enum: ['request', 'call_off'] }).notNull().default('request'),
    /** Local start/end minutes for `part = hours`, so leave maps onto coverage blocks. */
    startMinute: smallint('start_minute'),
    endMinute: smallint('end_minute'),
    createdAt: createdAt(),
  },
  (t) => [
    index('requests_org_member_idx').on(t.orgId, t.memberId),
    index('requests_org_dates_idx').on(t.orgId, t.startDate, t.endDate),
    uniqueIndex('requests_idem_idx').on(t.orgId, t.idempotencyKey),
  ],
);

/** APPEND-ONLY. Corrections are new rows; nothing updates or deletes a ledger row. */
export const balanceLedger = pgTable(
  'balance_ledger',
  {
    id: id(),
    orgId: orgRef(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    leaveTypeId: uuid('leave_type_id')
      .notNull()
      .references(() => leaveTypes.id),
    kind: text('kind', { enum: LEDGER_KINDS }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 4 }).notNull(),
    unit: text('unit', { enum: ['days', 'hours'] }).notNull().default('days'),
    effectiveDate: date('effective_date').notNull(),
    requestId: uuid('request_id').references(() => leaveRequests.id),
    /** Engine event key for scheduled postings (accrual/carryover/forfeiture): idempotent. */
    eventKey: text('event_key'),
    reason: text('reason'),
    createdByActorType: text('created_by_actor_type', { enum: ACTOR_TYPES }).notNull().default('human'),
    createdByMemberId: uuid('created_by_member_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('ledger_org_member_idx').on(t.orgId, t.memberId, t.leaveTypeId),
    uniqueIndex('ledger_event_key_idx').on(t.orgId, t.memberId, t.eventKey),
  ],
);

export const coverageRules = pgTable(
  'coverage_rules',
  {
    id: id(),
    orgId: orgRef(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    minPresent: integer('min_present').notNull(),
    /** Count only members with this tag (e.g. 'engineer'); null = everyone in the team. */
    tag: text('tag'),
    /** Monday-first mask of days the rule applies to. */
    weekdays: text('weekdays').notNull().default('1111100'),
    effectiveFrom: date('effective_from'),
    effectiveTo: date('effective_to'),
    createdAt: createdAt(),
  },
  (t) => [index('coverage_org_team_idx').on(t.orgId, t.teamId)],
);

export const blackouts = pgTable(
  'blackouts',
  {
    id: id(),
    orgId: orgRef(),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'cascade' }),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    reason: text('reason').notNull(),
    /** hard = blocks the request; soft = warns. */
    hard: boolean('hard').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('blackouts_org_idx').on(t.orgId)],
);

/** Every state-changing capability call (and every denied call) lands here. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    orgId: orgRef(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    actorType: text('actor_type', { enum: ACTOR_TYPES }).notNull(),
    actorMemberId: uuid('actor_member_id'),
    clientId: text('client_id'),
    onBehalfOfMemberId: uuid('on_behalf_of_member_id'),
    scopes: text('scopes')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    capability: text('capability').notNull(),
    effect: text('effect', { enum: ['read', 'draft', 'commit'] }).notNull(),
    outcome: text('outcome', { enum: ['ok', 'denied', 'error'] }).notNull(),
    summary: text('summary').notNull(),
    data: jsonb('data'),
  },
  (t) => [index('audit_org_at_idx').on(t.orgId, t.at)],
);

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: id(),
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
    feature: text('feature').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheHit: boolean('cache_hit').notNull().default(false),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_usage_org_at_idx').on(t.orgId, t.at)],
);

/** Handbook-import cache by content hash (AI cost rules). */
export const aiCache = pgTable('ai_cache', {
  key: text('key').primaryKey(),
  feature: text('feature').notNull(),
  model: text('model').notNull(),
  value: jsonb('value').notNull(),
  createdAt: createdAt(),
});

export const invites = pgTable(
  'invites',
  {
    id: id(),
    orgId: orgRef(),
    role: text('role', { enum: ROLES }).notNull().default('employee'),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    maxUses: integer('max_uses').notNull().default(1),
    uses: integer('uses').notNull().default(0),
    createdByMemberId: uuid('created_by_member_id'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('invites_org_idx').on(t.orgId)],
);

/** R2: agent-created drafts awaiting a human's confirmation. */
export const drafts = pgTable(
  'drafts',
  {
    id: id(),
    orgId: orgRef(),
    capability: text('capability').notNull(),
    payload: jsonb('payload').notNull(),
    summary: text('summary').notNull(),
    addressedToMemberId: uuid('addressed_to_member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    createdByActorType: text('created_by_actor_type', { enum: ACTOR_TYPES }).notNull(),
    createdByClientId: text('created_by_client_id'),
    confirmationTokenHash: text('confirmation_token_hash').notNull().unique(),
    status: text('status', { enum: ['open', 'confirmed', 'rejected', 'expired'] }).notNull().default('open'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('drafts_org_member_idx').on(t.orgId, t.addressedToMemberId)],
);

/** R6: autonomy level per org × capability × actor class. Absent row = default. */
export const autonomySettings = pgTable(
  'autonomy_settings',
  {
    id: id(),
    orgId: orgRef(),
    capability: text('capability').notNull(),
    actorClass: text('actor_class', { enum: ['agent', 'assistant'] }).notNull(),
    level: smallint('level').notNull(),
    /** Optional constraint, e.g. { leaveTypeKey: 'vacation', maxDays: 2 } for A11. */
    constraints: jsonb('constraints'),
    updatedByMemberId: uuid('updated_by_member_id'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('autonomy_org_cap_idx').on(t.orgId, t.capability, t.actorClass)],
);

// ── Phase 5: agent access ────────────────────────────────────────────────────

/**
 * Bearer tokens for agents (R3). Only a SHA-256 hash is stored; the token is shown once.
 *  - api_key: org-level, acts as a service agent (no member identity)
 *  - pat: personal access token, acts as an agent on behalf of its member
 *  - access: short-lived token minted by the client-credentials grant (service agent)
 */
export const apiTokens = pgTable(
  'api_tokens',
  {
    id: id(),
    orgId: orgRef(),
    kind: text('kind', { enum: ['api_key', 'pat', 'access'] }).notNull(),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    /** First characters, for recognising a token in lists (never enough to use it). */
    prefix: text('prefix').notNull(),
    scopes: text('scopes').array().notNull(),
    memberId: uuid('member_id').references(() => members.id, { onDelete: 'cascade' }),
    /** For 'access' tokens: the OAuth client that minted it. For others: a stable client id. */
    clientId: text('client_id').notNull(),
    createdByMemberId: uuid('created_by_member_id'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('api_tokens_org_idx').on(t.orgId)],
);

/** OAuth 2.0 client-credentials apps for service agents (Agentforce-style). */
export const oauthClients = pgTable(
  'oauth_clients',
  {
    id: id(),
    orgId: orgRef(),
    name: text('name').notNull(),
    clientId: text('client_id').notNull().unique(),
    secretHash: text('secret_hash').notNull(),
    scopes: text('scopes').array().notNull(),
    createdByMemberId: uuid('created_by_member_id'),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('oauth_clients_org_idx').on(t.orgId)],
);

/** Fixed-window request counters per token and rate-limit class (works across serverless instances). */
export const rateCounters = pgTable('rate_counters', {
  key: text('key').primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  count: integer('count').notNull().default(0),
});

export const WEBHOOK_EVENTS = [
  'leave.requested',
  'leave.decided',
  'balance.expiring',
  'plan.proposed',
  'coverage.gap_detected',
  'cover.requested',
  'cover.filled',
  'credential.expiring',
] as const;

export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: id(),
    orgId: orgRef(),
    url: text('url').notNull(),
    events: text('events').array().notNull(),
    /** HMAC signing secret. Shown once at creation; needed in clear to sign. */
    secret: text('secret').notNull(),
    active: boolean('active').notNull().default(true),
    createdByMemberId: uuid('created_by_member_id'),
    createdAt: createdAt(),
  },
  (t) => [index('webhook_endpoints_org_idx').on(t.orgId)],
);

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: id(),
    orgId: orgRef(),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    event: text('event').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status', { enum: ['pending', 'delivered', 'failed'] }).notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    lastStatusCode: integer('last_status_code'),
    lastError: text('last_error'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    /** Set for scheduled events (balance.expiring) so a daily scan never sends the same one twice. */
    dedupeKey: text('dedupe_key'),
    createdAt: createdAt(),
  },
  (t) => [
    index('webhook_deliveries_org_idx').on(t.orgId, t.createdAt),
    index('webhook_deliveries_due_idx').on(t.status, t.nextAttemptAt),
    uniqueIndex('webhook_deliveries_dedupe_idx').on(t.endpointId, t.dedupeKey),
  ],
);

// ── Slack app (Phase 7) ──────────────────────────────────────────────────────

/** One Slack workspace per org: the bot token from "Add to Slack" (sealed, see lib/secretBox). */
export const slackInstallations = pgTable(
  'slack_installations',
  {
    id: id(),
    orgId: orgRef(),
    teamId: text('team_id').notNull(),
    teamName: text('team_name'),
    botUserId: text('bot_user_id').notNull(),
    botToken: text('bot_token').notNull(),
    scopes: text('scopes').array().notNull(),
    installedByMemberId: uuid('installed_by_member_id'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('slack_installations_org_idx').on(t.orgId), uniqueIndex('slack_installations_team_idx').on(t.teamId)],
);

/** Event ids and interaction ids already handled, so Slack's retries do nothing twice. Pruned daily. */
export const slackReceipts = pgTable('slack_receipts', {
  key: text('key').primaryKey(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});

/** A person's consent to let us set their Slack status while they're out (user token, sealed). */
export const slackStatusGrants = pgTable(
  'slack_status_grants',
  {
    id: id(),
    orgId: orgRef(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    userToken: text('user_token').notNull(),
    /** The leave request whose status we last set, so the daily run doesn't repeat it. */
    lastRequestId: uuid('last_request_id'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('slack_status_grants_member_idx').on(t.memberId)],
);

// ─── Regulated coverage (docs/teams/COVERAGE-SPEC.md §2) ──────────────────────────────────
// Child data rule: demand tables hold COUNTS per group only. No child names, birthdays or
// identifiers anywhere (enforced by schema.childData.test.ts).

const localMinute = (name: string) => smallint(name).notNull();

/** A room (childcare) or post (clinic) at a site (= location). */
export const rooms = pgTable(
  'rooms',
  {
    id: id(),
    orgId: orgRef(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind', { enum: ['room', 'post'] }).notNull().default('room'),
    /** Pack demand group: an age group (childcare) or a service (clinic). */
    groupKey: text('group_key'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('rooms_org_loc_idx').on(t.orgId, t.locationId)],
);

/** Credential types an org tracks, e.g. `cpr`, `fully_qualified_teacher`, `rdh_licence`. */
export const credentials = pgTable(
  'credentials',
  {
    id: id(),
    orgId: orgRef(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    needsExpiry: boolean('needs_expiry').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('credentials_org_key_idx').on(t.orgId, t.key)],
);

export const memberCredentials = pgTable(
  'member_credentials',
  {
    id: id(),
    orgId: orgRef(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    credentialId: uuid('credential_id')
      .notNull()
      .references(() => credentials.id, { onDelete: 'cascade' }),
    issuedOn: date('issued_on'),
    expiresOn: date('expires_on'),
    /** Where the evidence is kept (e.g. "binder, office"). Never a copy of an ID document. */
    evidenceRef: text('evidence_ref'),
    verifiedByMemberId: uuid('verified_by_member_id'),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    importBatchId: uuid('import_batch_id'),
    createdAt: createdAt(),
  },
  (t) => [index('member_creds_org_member_idx').on(t.orgId, t.memberId), index('member_creds_expiry_idx').on(t.orgId, t.expiresOn)],
);

/** An org's immutable copy of a rule pack version (seeded, edited or drafted from text). */
export const rulePacks = pgTable(
  'rule_packs',
  {
    id: id(),
    orgId: orgRef(),
    key: text('key').notNull(),
    version: integer('version').notNull(),
    /** The full engine RulePack JSON. Versions are never updated; edits insert a new version. */
    pack: jsonb('pack').notNull(),
    source: text('source', { enum: ['seed', 'edited', 'drafted'] }).notNull().default('seed'),
    createdByMemberId: uuid('created_by_member_id'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('rule_packs_org_key_version_idx').on(t.orgId, t.key, t.version)],
);

/** Which packs apply at a site, from a date (a childcare pack plus a labour pack, typically). */
export const siteRulePacks = pgTable(
  'site_rule_packs',
  {
    id: id(),
    orgId: orgRef(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    rulePackId: uuid('rule_pack_id')
      .notNull()
      .references(() => rulePacks.id, { onDelete: 'cascade' }),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    createdAt: createdAt(),
  },
  (t) => [index('site_packs_org_loc_idx').on(t.orgId, t.locationId)],
);

/** Weekly demand template: COUNTS per group per local time window. */
export const demandTemplates = pgTable(
  'demand_templates',
  {
    id: id(),
    orgId: orgRef(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    /** Monday = 0. */
    weekday: smallint('weekday').notNull(),
    startMinute: localMinute('start_minute'),
    endMinute: localMinute('end_minute'),
    groupKey: text('group_key').notNull(),
    count: integer('count').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('demand_tpl_org_room_idx').on(t.orgId, t.roomId)],
);

/** Dated demand exceptions (counts) or closures. */
export const demandExceptions = pgTable(
  'demand_exceptions',
  {
    id: id(),
    orgId: orgRef(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    closed: boolean('closed').notNull().default(false),
    startMinute: smallint('start_minute'),
    endMinute: smallint('end_minute'),
    groupKey: text('group_key'),
    count: integer('count'),
    createdAt: createdAt(),
  },
  (t) => [index('demand_ex_org_room_date_idx').on(t.orgId, t.roomId, t.date)],
);

/** Weekly shift template per member. `end_minute ≤ start_minute` crosses midnight. */
export const shiftTemplates = pgTable(
  'shift_templates',
  {
    id: id(),
    orgId: orgRef(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    weekday: smallint('weekday').notNull(),
    startMinute: localMinute('start_minute'),
    endMinute: localMinute('end_minute'),
    effectiveFrom: date('effective_from'),
    effectiveTo: date('effective_to'),
    importBatchId: uuid('import_batch_id'),
    createdAt: createdAt(),
  },
  (t) => [index('shift_tpl_org_member_idx').on(t.orgId, t.memberId), index('shift_tpl_org_room_idx').on(t.orgId, t.roomId)],
);

/** Dated schedule changes: an extra/changed shift, or `off`. Accepted cover lands here. */
export const shiftExceptions = pgTable(
  'shift_exceptions',
  {
    id: id(),
    orgId: orgRef(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    kind: text('kind', { enum: ['shift', 'off'] }).notNull().default('shift'),
    roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'cascade' }),
    startMinute: smallint('start_minute'),
    endMinute: smallint('end_minute'),
    coverRequestId: uuid('cover_request_id'),
    createdAt: createdAt(),
  },
  (t) => [index('shift_ex_org_member_date_idx').on(t.orgId, t.memberId, t.date), index('shift_ex_org_date_idx').on(t.orgId, t.date)],
);

/** Hours actually worked, imported per pay period (payroll / time clock CSV). Append-only. */
export const hoursWorked = pgTable(
  'hours_worked',
  {
    id: id(),
    orgId: orgRef(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    hours: numeric('hours', { precision: 7, scale: 2 }).notNull(),
    importBatchId: uuid('import_batch_id'),
    /** Rolled-back imports are voided, never deleted. */
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index('hours_org_member_idx').on(t.orgId, t.memberId, t.periodEnd)],
);

export const COVER_SOURCES = ['leave_request', 'call_off', 'credential_lapse', 'manual'] as const;
export const COVER_EVENT_KINDS = [
  'created',
  'ranked',
  'offers_sent',
  'accepted',
  'declined',
  'rule_recheck_failed',
  'filled',
  'cancelled',
  'reverted',
] as const;

export const coverRequests = pgTable(
  'cover_requests',
  {
    id: id(),
    orgId: orgRef(),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'cascade' }),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    startMinute: localMinute('start_minute'),
    endMinute: localMinute('end_minute'),
    /** Engine snapshot of the gap: rule broken, required, present, citation. */
    gap: jsonb('gap').notNull(),
    source: text('source', { enum: COVER_SOURCES }).notNull(),
    sourceId: uuid('source_id'),
    absentMemberId: uuid('absent_member_id'),
    waveSize: smallint('wave_size').notNull().default(3),
    waveWaitMinutes: smallint('wave_wait_minutes').notNull().default(15),
    createdByMemberId: uuid('created_by_member_id'),
    /** Retries of requestCover with the same key return the same request. */
    idempotencyKey: text('idempotency_key'),
    createdAt: createdAt(),
  },
  (t) => [index('cover_req_org_date_idx').on(t.orgId, t.date), uniqueIndex('cover_req_idem_idx').on(t.orgId, t.idempotencyKey)],
);

export const coverOffers = pgTable(
  'cover_offers',
  {
    id: id(),
    orgId: orgRef(),
    coverRequestId: uuid('cover_request_id')
      .notNull()
      .references(() => coverRequests.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    wave: smallint('wave').notNull(),
    rank: smallint('rank').notNull(),
    channel: text('channel').notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true }).notNull(),
    response: text('response', { enum: ['accepted', 'declined', 'expired', 'superseded'] }),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('cover_offer_req_member_idx').on(t.coverRequestId, t.memberId), index('cover_offer_org_member_idx').on(t.orgId, t.memberId)],
);

/** APPEND-ONLY cover history. A request's state is a fold over its events. */
export const coverEvents = pgTable(
  'cover_events',
  {
    id: id(),
    orgId: orgRef(),
    coverRequestId: uuid('cover_request_id')
      .notNull()
      .references(() => coverRequests.id, { onDelete: 'cascade' }),
    at: timestamp('at', { withTimezone: true }).notNull(),
    kind: text('kind', { enum: COVER_EVENT_KINDS }).notNull(),
    memberId: uuid('member_id'),
    actorType: text('actor_type', { enum: ACTOR_TYPES }).notNull().default('human'),
    actorMemberId: uuid('actor_member_id'),
    data: jsonb('data'),
  },
  (t) => [
    index('cover_events_req_idx').on(t.coverRequestId, t.at),
    // Exactly one `filled` per request: two simultaneous accepts cannot both win (RC4).
    uniqueIndex('cover_events_one_fill_idx').on(t.coverRequestId).where(sql`kind = 'filled'`),
    index('cover_events_org_member_idx').on(t.orgId, t.memberId, t.kind),
  ],
);

/** Cover preferences per member. */
export const memberCoverPrefs = pgTable(
  'member_cover_prefs',
  {
    id: id(),
    orgId: orgRef(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    optIn: text('opt_in', { enum: ['yes', 'no', 'ask'] }).notNull().default('ask'),
    allowedLocationIds: uuid('allowed_location_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    /** Text-message cover offers: only with explicit opt-in, and only once an SMS provider is configured. */
    smsOptIn: boolean('sms_opt_in').notNull().default(false),
    smsPhone: text('sms_phone'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('cover_prefs_org_member_idx').on(t.orgId, t.memberId)],
);

/** WebAuthn passkeys for staff without Slack (public keys only; never a secret). */
export const passkeys = pgTable(
  'passkeys',
  {
    id: id(),
    orgId: orgRef(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    credentialId: text('credential_id').notNull(),
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    transports: text('transports').array().notNull().default(sql`'{}'::text[]`),
    name: text('name'),
    createdAt: createdAt(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('passkeys_credential_idx').on(t.credentialId), index('passkeys_org_member_idx').on(t.orgId, t.memberId)],
);

/** Admin-issued one-time sign-in codes (fallback to passkeys). Hashed, short-lived, single use. */
export const loginCodes = pgTable(
  'login_codes',
  {
    id: id(),
    orgId: orgRef(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    codeHash: text('code_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    attempts: smallint('attempts').notNull().default(0),
    createdByMemberId: uuid('created_by_member_id'),
    createdAt: createdAt(),
  },
  (t) => [index('login_codes_member_idx').on(t.memberId, t.createdAt)],
);

/** Web Push subscriptions for cover offers. */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: id(),
    orgId: orgRef(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('push_endpoint_idx').on(t.endpoint), index('push_org_member_idx').on(t.orgId, t.memberId)],
);

/** Pay rates: only while the org has cost-aware ranking on; owner/admin only; never to the LLM. */
export const memberPayRates = pgTable(
  'member_pay_rates',
  {
    id: id(),
    orgId: orgRef(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    hourlyRate: numeric('hourly_rate', { precision: 8, scale: 2 }).notNull(),
    effectiveFrom: date('effective_from').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('pay_rates_org_member_idx').on(t.orgId, t.memberId)],
);
