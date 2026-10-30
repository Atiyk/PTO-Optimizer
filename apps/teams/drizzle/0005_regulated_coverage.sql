CREATE TABLE "cover_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"cover_request_id" uuid NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"member_id" uuid,
	"actor_type" text DEFAULT 'human' NOT NULL,
	"actor_member_id" uuid,
	"data" jsonb
);
--> statement-breakpoint
CREATE TABLE "cover_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"cover_request_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"wave" smallint NOT NULL,
	"rank" smallint NOT NULL,
	"channel" text NOT NULL,
	"sent_at" timestamp with time zone NOT NULL,
	"response" text,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cover_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"date" date NOT NULL,
	"start_minute" smallint NOT NULL,
	"end_minute" smallint NOT NULL,
	"gap" jsonb NOT NULL,
	"source" text NOT NULL,
	"source_id" uuid,
	"absent_member_id" uuid,
	"wave_size" smallint DEFAULT 3 NOT NULL,
	"wave_wait_minutes" smallint DEFAULT 15 NOT NULL,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"needs_expiry" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demand_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"date" date NOT NULL,
	"closed" boolean DEFAULT false NOT NULL,
	"start_minute" smallint,
	"end_minute" smallint,
	"group_key" text,
	"count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "demand_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_minute" smallint NOT NULL,
	"end_minute" smallint NOT NULL,
	"group_key" text NOT NULL,
	"count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hours_worked" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"hours" numeric(7, 2) NOT NULL,
	"import_batch_id" uuid,
	"voided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_cover_prefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"opt_in" text DEFAULT 'ask' NOT NULL,
	"allowed_location_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"credential_id" uuid NOT NULL,
	"issued_on" date,
	"expires_on" date,
	"evidence_ref" text,
	"verified_by_member_id" uuid,
	"verified_at" timestamp with time zone,
	"import_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_pay_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"hourly_rate" numeric(8, 2) NOT NULL,
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'room' NOT NULL,
	"group_key" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rule_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"key" text NOT NULL,
	"version" integer NOT NULL,
	"pack" jsonb NOT NULL,
	"source" text DEFAULT 'seed' NOT NULL,
	"created_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"date" date NOT NULL,
	"kind" text DEFAULT 'shift' NOT NULL,
	"room_id" uuid,
	"start_minute" smallint,
	"end_minute" smallint,
	"cover_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shift_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_minute" smallint NOT NULL,
	"end_minute" smallint NOT NULL,
	"effective_from" date,
	"effective_to" date,
	"import_batch_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_rule_packs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"location_id" uuid NOT NULL,
	"rule_pack_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "source" text DEFAULT 'request' NOT NULL;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "start_minute" smallint;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD COLUMN "end_minute" smallint;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "employment_type" text DEFAULT 'salaried' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "vertical" text DEFAULT 'general' NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "cost_aware_ranking" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "call_off_reasons_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cover_events" ADD CONSTRAINT "cover_events_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cover_events" ADD CONSTRAINT "cover_events_cover_request_id_cover_requests_id_fk" FOREIGN KEY ("cover_request_id") REFERENCES "public"."cover_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cover_offers" ADD CONSTRAINT "cover_offers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cover_offers" ADD CONSTRAINT "cover_offers_cover_request_id_cover_requests_id_fk" FOREIGN KEY ("cover_request_id") REFERENCES "public"."cover_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cover_offers" ADD CONSTRAINT "cover_offers_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cover_requests" ADD CONSTRAINT "cover_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cover_requests" ADD CONSTRAINT "cover_requests_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cover_requests" ADD CONSTRAINT "cover_requests_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_exceptions" ADD CONSTRAINT "demand_exceptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_exceptions" ADD CONSTRAINT "demand_exceptions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_templates" ADD CONSTRAINT "demand_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_templates" ADD CONSTRAINT "demand_templates_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hours_worked" ADD CONSTRAINT "hours_worked_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hours_worked" ADD CONSTRAINT "hours_worked_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_cover_prefs" ADD CONSTRAINT "member_cover_prefs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_cover_prefs" ADD CONSTRAINT "member_cover_prefs_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_credentials" ADD CONSTRAINT "member_credentials_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_credentials" ADD CONSTRAINT "member_credentials_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_credentials" ADD CONSTRAINT "member_credentials_credential_id_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."credentials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_pay_rates" ADD CONSTRAINT "member_pay_rates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_pay_rates" ADD CONSTRAINT "member_pay_rates_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule_packs" ADD CONSTRAINT "rule_packs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_exceptions" ADD CONSTRAINT "shift_exceptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_exceptions" ADD CONSTRAINT "shift_exceptions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_exceptions" ADD CONSTRAINT "shift_exceptions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_rule_packs" ADD CONSTRAINT "site_rule_packs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_rule_packs" ADD CONSTRAINT "site_rule_packs_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_rule_packs" ADD CONSTRAINT "site_rule_packs_rule_pack_id_rule_packs_id_fk" FOREIGN KEY ("rule_pack_id") REFERENCES "public"."rule_packs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cover_events_req_idx" ON "cover_events" USING btree ("cover_request_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "cover_events_one_fill_idx" ON "cover_events" USING btree ("cover_request_id") WHERE kind = 'filled';--> statement-breakpoint
CREATE INDEX "cover_events_org_member_idx" ON "cover_events" USING btree ("org_id","member_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "cover_offer_req_member_idx" ON "cover_offers" USING btree ("cover_request_id","member_id");--> statement-breakpoint
CREATE INDEX "cover_offer_org_member_idx" ON "cover_offers" USING btree ("org_id","member_id");--> statement-breakpoint
CREATE INDEX "cover_req_org_date_idx" ON "cover_requests" USING btree ("org_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "credentials_org_key_idx" ON "credentials" USING btree ("org_id","key");--> statement-breakpoint
CREATE INDEX "demand_ex_org_room_date_idx" ON "demand_exceptions" USING btree ("org_id","room_id","date");--> statement-breakpoint
CREATE INDEX "demand_tpl_org_room_idx" ON "demand_templates" USING btree ("org_id","room_id");--> statement-breakpoint
CREATE INDEX "hours_org_member_idx" ON "hours_worked" USING btree ("org_id","member_id","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "cover_prefs_org_member_idx" ON "member_cover_prefs" USING btree ("org_id","member_id");--> statement-breakpoint
CREATE INDEX "member_creds_org_member_idx" ON "member_credentials" USING btree ("org_id","member_id");--> statement-breakpoint
CREATE INDEX "member_creds_expiry_idx" ON "member_credentials" USING btree ("org_id","expires_on");--> statement-breakpoint
CREATE INDEX "pay_rates_org_member_idx" ON "member_pay_rates" USING btree ("org_id","member_id");--> statement-breakpoint
CREATE INDEX "rooms_org_loc_idx" ON "rooms" USING btree ("org_id","location_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rule_packs_org_key_version_idx" ON "rule_packs" USING btree ("org_id","key","version");--> statement-breakpoint
CREATE INDEX "shift_ex_org_member_date_idx" ON "shift_exceptions" USING btree ("org_id","member_id","date");--> statement-breakpoint
CREATE INDEX "shift_ex_org_date_idx" ON "shift_exceptions" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "shift_tpl_org_member_idx" ON "shift_templates" USING btree ("org_id","member_id");--> statement-breakpoint
CREATE INDEX "shift_tpl_org_room_idx" ON "shift_templates" USING btree ("org_id","room_id");--> statement-breakpoint
CREATE INDEX "site_packs_org_loc_idx" ON "site_rule_packs" USING btree ("org_id","location_id");