-- Reverses 0010_ai_features_switch.sql. Drops only what 0010 added.
-- Orgs that had turned AI features off get them back on (the env switch AI_DISABLED still applies).
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "ai_features_enabled";
