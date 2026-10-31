-- Reverses 0009_decision_flow.sql. Drops only what 0009 added.
-- Approval policies, HR tasks, shadow results and window allocations are lost. Requests keep
-- their status; any `recorded` request should be re-set by an admin before rolling back.
DROP TABLE IF EXISTS "window_allocations";
DROP TABLE IF EXISTS "shadow_decisions";
DROP TABLE IF EXISTS "hr_tasks";
DROP TABLE IF EXISTS "approval_policies";
ALTER TABLE "leave_requests" DROP COLUMN IF EXISTS "decision_snapshot";
ALTER TABLE "leave_requests" DROP COLUMN IF EXISTS "escalation_level";
ALTER TABLE "leave_requests" DROP COLUMN IF EXISTS "last_reminded_at";
ALTER TABLE "leave_requests" DROP COLUMN IF EXISTS "decline_reason";
ALTER TABLE "leave_types" DROP COLUMN IF EXISTS "protected_category";
