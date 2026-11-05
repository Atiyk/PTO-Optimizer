-- Reverses 0011_pto_payout.sql. Drops only what 0011 added.
-- Payout policies are lost; payout estimates switch off. Pay rates are untouched (they remain
-- governed by cost-aware ranking).
DROP TABLE IF EXISTS "payout_policies";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "payout_money_estimates";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "payout_employee_estimates";
