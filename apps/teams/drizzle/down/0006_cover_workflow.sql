-- Reverses 0006_cover_workflow.sql. Drops only what 0006 added.
-- Staff who signed in with passkeys or codes will need to sign in another way afterwards.
DROP TABLE IF EXISTS "push_subscriptions";
DROP TABLE IF EXISTS "passkeys";
DROP TABLE IF EXISTS "login_codes";
ALTER TABLE "member_cover_prefs" DROP COLUMN IF EXISTS "sms_phone";
ALTER TABLE "member_cover_prefs" DROP COLUMN IF EXISTS "sms_opt_in";
DROP INDEX IF EXISTS "cover_req_idem_idx";
ALTER TABLE "cover_requests" DROP COLUMN IF EXISTS "idempotency_key";
