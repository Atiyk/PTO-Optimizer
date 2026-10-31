-- Reverses 0007_time_clock.sql. Drops only what 0007 added.
-- Punches and timesheet approvals are lost; hours already synced to hours_worked stay (as rows without a source).
DROP TABLE IF EXISTS "timesheet_approvals";
DROP TABLE IF EXISTS "time_punches";
ALTER TABLE "hours_worked" DROP COLUMN IF EXISTS "source";
ALTER TABLE "locations" DROP COLUMN IF EXISTS "labor_pack_key";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "time_clock_enabled";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "overtime_policy";
