-- Reverses 0005_regulated_coverage.sql. Drops only what 0005 added; MVP tables and rows are untouched.
-- Run by hand (psql) only after exporting any coverage data you want to keep.
DROP TABLE IF EXISTS "member_pay_rates";
DROP TABLE IF EXISTS "member_cover_prefs";
DROP TABLE IF EXISTS "cover_events";
DROP TABLE IF EXISTS "cover_offers";
DROP TABLE IF EXISTS "cover_requests";
DROP TABLE IF EXISTS "hours_worked";
DROP TABLE IF EXISTS "shift_exceptions";
DROP TABLE IF EXISTS "shift_templates";
DROP TABLE IF EXISTS "demand_exceptions";
DROP TABLE IF EXISTS "demand_templates";
DROP TABLE IF EXISTS "site_rule_packs";
DROP TABLE IF EXISTS "rule_packs";
DROP TABLE IF EXISTS "member_credentials";
DROP TABLE IF EXISTS "credentials";
DROP TABLE IF EXISTS "rooms";
ALTER TABLE "leave_requests" DROP COLUMN IF EXISTS "end_minute";
ALTER TABLE "leave_requests" DROP COLUMN IF EXISTS "start_minute";
ALTER TABLE "leave_requests" DROP COLUMN IF EXISTS "source";
ALTER TABLE "members" DROP COLUMN IF EXISTS "employment_type";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "call_off_reasons_enabled";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "cost_aware_ranking";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "vertical";
