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
  /** Minutes an auto-approval stays reversible by the manager. */
  autoApprovalReversibleMinutes: integer('auto_approval_reversible_minutes').notNull().default(48 * 60),
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
