import { sql } from 'drizzle-orm';
import { date, index, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/*
 * Tenant isolation: every business table carries org_id, and every query in
 * src/capabilities goes through a context that already holds the caller's org id
 * (see docs/teams/ARCHITECTURE.md). Phase 1 extends this schema to the full domain model.
 */

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email'),
    role: text('role', { enum: ['owner', 'admin', 'manager', 'employee'] }).notNull().default('employee'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [index('members_org_idx').on(t.orgId)],
);

/** Append-only. Balances are derived from these rows by the engine, never stored. */
export const balanceLedger = pgTable(
  'balance_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'cascade' }),
    leaveType: text('leave_type').notNull(),
    kind: text('kind', {
      enum: ['accrual', 'usage', 'adjustment', 'carryover', 'forfeiture', 'import'],
    }).notNull(),
    amount: numeric('amount', { precision: 12, scale: 4 }).notNull(),
    unit: text('unit', { enum: ['days', 'hours'] }).notNull().default('days'),
    effectiveDate: date('effective_date').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ledger_org_member_idx').on(t.orgId, t.memberId)],
);

/** Every capability call that changes state (and every denied call) lands here. */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    actorType: text('actor_type', {
      enum: ['human', 'agent-on-behalf-of-user', 'service-agent'],
    }).notNull(),
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
