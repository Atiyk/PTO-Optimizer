-- Reverses 0008_approvals_automations.sql. Drops only what 0008 added.
-- Groups, policy rules, events, profile change requests and Teams links are lost.
DROP TABLE IF EXISTS "msteams_users";
DROP TABLE IF EXISTS "msteams_tenants";
DROP TABLE IF EXISTS "profile_change_requests";
DROP TABLE IF EXISTS "team_events";
DROP TABLE IF EXISTS "policy_rules";
DROP TABLE IF EXISTS "group_members";
DROP TABLE IF EXISTS "groups";
ALTER TABLE "blackouts" DROP COLUMN IF EXISTS "leave_type_keys";
ALTER TABLE "blackouts" DROP COLUMN IF EXISTS "location_ids";
ALTER TABLE "blackouts" DROP COLUMN IF EXISTS "group_ids";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "plan";
ALTER TABLE "teams" DROP COLUMN IF EXISTS "approver_member_id";
ALTER TABLE "teams" DROP COLUMN IF EXISTS "backup_approver_member_id";
