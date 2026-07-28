-- ============================================================
-- Onyxx Tech — Supabase Migration 05: expense scope
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
--
-- *** RUN THIS BEFORE USING THE UPDATED DASHBOARD ***
--
-- The dashboard now writes expenses.scope on every save. Without this column
-- the insert fails outright, so recording an expense stops working. This is the
-- one migration that is a hard prerequisite rather than housekeeping.
--
-- Touches no policies, so it is safe either side of 03.
-- ============================================================


-- ============================================================
-- 1. THE COLUMN
-- ============================================================
-- Splits an expense by WHO IT WAS FOR, which is what decides how the cost is
-- carried:
--
-- Everything is paid with COMPANY money, so nothing is ever reimbursed:
--
--   'company'   Bought for the studio. Shrinks the pool before it is divided,
--               so the cost lands on both partners by the agreed split.
--   'personal'  Bought for the buyer. Comes off that partner's share alone —
--               in substance them taking money out — and the other partner's
--               figures do not move.
--
-- DEFAULT 'company' is deliberate and matters for the existing rows: before
-- this column existed, every expense was a business cost, so 'company' is not
-- a neutral fallback — it is what those rows actually meant.
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'company';

-- Explicit backfill for safety. ADD COLUMN ... DEFAULT already populates
-- existing rows, but this makes the intent visible and survives the column
-- having been added by hand without a default.
UPDATE expenses SET scope = 'company' WHERE scope IS NULL;


-- ============================================================
-- 2. CONSTRAINT
-- ============================================================
-- Only two values are meaningful. A third would be read by the dashboard as
-- 'company' (anything not exactly 'personal' falls through to the shared
-- branch), which would quietly split a cost that should not have been split.
DO $$
BEGIN
  ALTER TABLE expenses
    ADD CONSTRAINT expenses_scope_is_valid
    CHECK (scope IN ('company', 'personal'));
EXCEPTION
  WHEN duplicate_object THEN RAISE NOTICE 'scope check already present, skipping';
  WHEN check_violation THEN
    RAISE EXCEPTION 'Existing expenses have a scope outside (company, personal). Inspect first: SELECT id, item, scope FROM expenses WHERE scope NOT IN (''company'', ''personal'');';
END $$;


-- Partner-level reporting filters on this, and so does every balance
-- calculation once there are enough rows to matter.
CREATE INDEX IF NOT EXISTS expenses_scope_idx ON expenses (scope);


-- ============================================================
-- 3. VERIFY
-- ============================================================
-- Expect every existing row to read 'company'.
SELECT scope, count(*) AS rows, sum(amount) AS total
FROM expenses
GROUP BY scope
ORDER BY scope;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'expenses'::regclass
  AND conname IN ('expenses_scope_is_valid', 'expenses_paid_by_is_a_partner');
