CREATE TABLE "slack_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"team_id" text NOT NULL,
	"team_name" text,
	"bot_user_id" text NOT NULL,
	"bot_token" text NOT NULL,
	"scopes" text[] NOT NULL,
	"installed_by_member_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slack_receipts" (
	"key" text PRIMARY KEY NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slack_status_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"user_token" text NOT NULL,
	"last_request_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "slack_installations" ADD CONSTRAINT "slack_installations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_status_grants" ADD CONSTRAINT "slack_status_grants_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slack_status_grants" ADD CONSTRAINT "slack_status_grants_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "slack_installations_org_idx" ON "slack_installations" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "slack_installations_team_idx" ON "slack_installations" USING btree ("team_id");--> statement-breakpoint
CREATE UNIQUE INDEX "slack_status_grants_member_idx" ON "slack_status_grants" USING btree ("member_id");