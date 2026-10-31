CREATE TABLE "time_punches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"location_id" uuid,
	"kind" text NOT NULL,
	"break_kind" text,
	"at" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'self' NOT NULL,
	"rest_breaks_taken" boolean,
	"note" text,
	"idempotency_key" text,
	"created_by_member_id" uuid,
	"voided_at" timestamp with time zone,
	"voided_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timesheet_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"total_hours" numeric(7, 2) NOT NULL,
	"regular_hours" numeric(7, 2) NOT NULL,
	"overtime_hours" numeric(7, 2) NOT NULL,
	"double_time_hours" numeric(7, 2) NOT NULL,
	"issue_count" integer DEFAULT 0 NOT NULL,
	"approved_by_member_id" uuid,
	"approved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "hours_worked" ADD COLUMN "source" text DEFAULT 'import' NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "labor_pack_key" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "time_clock_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "overtime_policy" text DEFAULT 'avoid' NOT NULL;--> statement-breakpoint
ALTER TABLE "time_punches" ADD CONSTRAINT "time_punches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_punches" ADD CONSTRAINT "time_punches_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_punches" ADD CONSTRAINT "time_punches_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_approvals" ADD CONSTRAINT "timesheet_approvals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timesheet_approvals" ADD CONSTRAINT "timesheet_approvals_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "punch_org_member_at_idx" ON "time_punches" USING btree ("org_id","member_id","at");--> statement-breakpoint
CREATE INDEX "punch_org_at_idx" ON "time_punches" USING btree ("org_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "punch_idem_idx" ON "time_punches" USING btree ("org_id","member_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "ts_appr_org_week_idx" ON "timesheet_approvals" USING btree ("org_id","week_start");--> statement-breakpoint
CREATE INDEX "ts_appr_org_member_idx" ON "timesheet_approvals" USING btree ("org_id","member_id");