CREATE TABLE "approval_policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mode" text DEFAULT 'suggest' NOT NULL,
	"leave_type_keys" text[] DEFAULT '{}'::text[] NOT NULL,
	"location_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"team_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"group_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"max_days" numeric(6, 2),
	"min_notice_days" integer,
	"tolerated_warnings" text[] DEFAULT '{}'::text[] NOT NULL,
	"reversible_minutes" integer,
	"sla_hours" integer DEFAULT 24 NOT NULL,
	"escalate_after_hours" integer DEFAULT 48 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hr_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"request_id" uuid,
	"member_id" uuid,
	"due_at" date,
	"done_at" timestamp with time zone,
	"done_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shadow_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"policy_id" uuid,
	"would_auto_approve" boolean NOT NULL,
	"human_decision" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "window_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"rule_id" uuid NOT NULL,
	"seed" integer,
	"results" jsonb NOT NULL,
	"confirmed_by_member_id" uuid,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "decision_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "escalation_level" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "last_reminded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "decline_reason" text;--> statement-breakpoint
ALTER TABLE "leave_types" ADD COLUMN "protected_category" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_policies" ADD CONSTRAINT "approval_policies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_tasks" ADD CONSTRAINT "hr_tasks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_tasks" ADD CONSTRAINT "hr_tasks_request_id_leave_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."leave_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hr_tasks" ADD CONSTRAINT "hr_tasks_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shadow_decisions" ADD CONSTRAINT "shadow_decisions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shadow_decisions" ADD CONSTRAINT "shadow_decisions_request_id_leave_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."leave_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "window_allocations" ADD CONSTRAINT "window_allocations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "window_allocations" ADD CONSTRAINT "window_allocations_rule_id_policy_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."policy_rules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_policies_org_idx" ON "approval_policies" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "hr_tasks_org_idx" ON "hr_tasks" USING btree ("org_id","done_at");--> statement-breakpoint
CREATE UNIQUE INDEX "hr_tasks_request_kind_idx" ON "hr_tasks" USING btree ("request_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "shadow_decisions_request_idx" ON "shadow_decisions" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "shadow_decisions_org_idx" ON "shadow_decisions" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "window_allocations_rule_idx" ON "window_allocations" USING btree ("rule_id");