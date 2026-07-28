-- ============================================================
-- Onyxx Tech — Supabase Migration 04: integrity, audit trail, indexes
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
--
-- Housekeeping only. Nothing here changes a figure the dashboard reports, and
-- nothing here is destructive: no DROP, no DELETE, no column removal.
--
-- ORDER: run this AFTER 01 and 02. It is independent of 03 — either order works
-- between those two — but remember the standing rule that 03 must be the LAST
-- policy-touching file run. This file touches no policies, so running 04 after
-- 03 does not disturb the allowlist.
--
-- Safe to re-run: every statement is IF NOT EXISTS or guarded.
-- ============================================================


-- ============================================================
-- 1. CONSTRAINTS — stop bad data being accepted in the first place
-- ============================================================

-- partner_withdrawals.partner had only a comment saying 'Kunacosta' or
-- 'Rooben'. Migration 02 added exactly this guard to expenses.paid_by, with the
-- reasoning that a wrong name "silently corrupts both partners' figures" — that
-- applies here identically. fin.withdrawn is keyed off the PARTNERS list, so a
-- row saying 'Kuna' is read successfully, counted in the account total, and
-- attributed to NOBODY. The reconciliation breaks with no indication of which
-- row did it.
--
-- `IS NOT NULL` is not redundant: NULL IN (...) evaluates to NULL, not false,
-- and a CHECK passes on NULL. Without it a blank partner would be accepted.
DO $$
BEGIN
  ALTER TABLE partner_withdrawals
    ADD CONSTRAINT partner_withdrawals_partner_is_a_partner
    CHECK (partner IS NOT NULL AND partner IN ('Kunacosta', 'Rooben'));
EXCEPTION
  WHEN duplicate_object THEN RAISE NOTICE 'partner check already present, skipping';
  WHEN check_violation THEN
    RAISE EXCEPTION 'Existing partner_withdrawals rows have a partner outside (Kunacosta, Rooben). Fix them first: SELECT id, partner, amount FROM partner_withdrawals WHERE partner IS NULL OR partner NOT IN (''Kunacosta'', ''Rooben'');';
END $$;


-- A quote number is how you refer to a quotation with a client, so two rows
-- sharing one is a filing error. The dashboard writes it as free text.
-- Partial index: several quotes may legitimately have no number yet.
CREATE UNIQUE INDEX IF NOT EXISTS quotations_quote_number_unique
  ON quotations (quote_number)
  WHERE quote_number IS NOT NULL;


-- subtotal + sst_amount must equal total. All three are typed in by hand and
-- nothing cross-checked them, so a mistyped subtotal silently produced a
-- quotation whose parts do not add up — and the dashboard now apportions SST as
-- sst_amount/total of every ringgit collected, so a wrong ratio here misstates
-- how much of the collected money is tax rather than profit.
--
-- 0.01 tolerance because these are NUMERIC values entered to the cent, and the
-- rounding of an 8% SST calculation can legitimately land a cent out.
DO $$
BEGIN
  ALTER TABLE quotations
    ADD CONSTRAINT quotations_parts_sum_to_total
    CHECK (
      subtotal IS NULL OR sst_amount IS NULL OR total IS NULL
      OR abs((subtotal + sst_amount) - total) <= 0.01
    );
EXCEPTION
  WHEN duplicate_object THEN RAISE NOTICE 'quotation sum check already present, skipping';
  WHEN check_violation THEN
    RAISE EXCEPTION 'Existing quotations have subtotal + sst_amount <> total. Inspect them first: SELECT id, quote_number, subtotal, sst_amount, total FROM quotations WHERE abs((subtotal + sst_amount) - total) > 0.01;';
END $$;


-- valid_until before quote_date is always a typo.
DO $$
BEGIN
  ALTER TABLE quotations
    ADD CONSTRAINT quotations_valid_until_after_quote_date
    CHECK (valid_until IS NULL OR quote_date IS NULL OR valid_until >= quote_date);
EXCEPTION
  WHEN duplicate_object THEN RAISE NOTICE 'valid_until check already present, skipping';
  WHEN check_violation THEN
    RAISE EXCEPTION 'Existing quotations have valid_until before quote_date. Inspect: SELECT id, quote_number, quote_date, valid_until FROM quotations WHERE valid_until < quote_date;';
END $$;


-- project_addons.date is the ORDER BY column in the dashboard and is nullable.
-- Postgres sorts NULLS FIRST on DESC, so a dateless add-on jumps above every
-- dated one. Backfill, then require it.
UPDATE project_addons SET date = CURRENT_DATE WHERE date IS NULL;
ALTER TABLE project_addons ALTER COLUMN date SET DEFAULT CURRENT_DATE;
DO $$
BEGIN
  ALTER TABLE project_addons ALTER COLUMN date SET NOT NULL;
EXCEPTION
  WHEN others THEN RAISE NOTICE 'could not set project_addons.date NOT NULL: %', SQLERRM;
END $$;


-- ============================================================
-- 2. AUDIT TRAIL — updated_at on the tables that hold money
-- ============================================================
-- Two partners settle real money against these figures, and a single checkbox
-- click flips revenue-affecting state. There was no way to answer "when did
-- this payment amount change?". system_settings already had updated_at (kept
-- current by the client); these four had nothing.
--
-- Maintained by a trigger rather than by the client, so it cannot be forgotten
-- at a call site — and cannot be back-dated by whatever wrote the row.

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
      'projects', 'expenses', 'partner_withdrawals', 'project_payments',
      'project_addons', 'quotations'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skipping %, table does not exist', t;
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone(''utc''::text, now())', t);

    -- Drop first so re-running does not stack duplicate triggers.
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_set_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_set_updated_at', t);
  END LOOP;
END $$;


-- ============================================================
-- 3. INDEXES
-- ============================================================
-- loadAllData() issues ten ordered queries and runs after EVERY mutation, so
-- these are the columns actually sorted on. Irrelevant at today's row counts —
-- included because they are free now and awkward to add once the tables are
-- large and busy.
--
-- Migration 02 already indexed project_payments, project_addons and quotations
-- on their foreign keys; this covers the ordering columns and the one FK that
-- was missed.

CREATE INDEX IF NOT EXISTS projects_created_at_idx            ON projects (created_at DESC);
CREATE INDEX IF NOT EXISTS projects_status_idx                ON projects (status);
CREATE INDEX IF NOT EXISTS expenses_date_idx                  ON expenses (date DESC);

-- Unindexed foreign key: expenses.linked_project_id is ON DELETE SET NULL, so
-- deleting a project scans the whole expenses table to find referencing rows.
CREATE INDEX IF NOT EXISTS expenses_linked_project_id_idx     ON expenses (linked_project_id);

CREATE INDEX IF NOT EXISTS partner_withdrawals_date_idx       ON partner_withdrawals (date DESC);
CREATE INDEX IF NOT EXISTS partner_withdrawals_partner_idx    ON partner_withdrawals (partner);
CREATE INDEX IF NOT EXISTS project_addons_date_idx            ON project_addons (date DESC);
CREATE INDEX IF NOT EXISTS quotations_quote_date_idx          ON quotations (quote_date DESC);
CREATE INDEX IF NOT EXISTS showcase_projects_created_at_idx   ON showcase_projects (created_at DESC);

-- received_date drives revenueByMonth(), which every chart reads.
CREATE INDEX IF NOT EXISTS project_payments_received_date_idx
  ON project_payments (received_date) WHERE received = true;


-- ============================================================
-- 4. VERIFY
-- ============================================================
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conname IN (
  'partner_withdrawals_partner_is_a_partner',
  'quotations_parts_sum_to_total',
  'quotations_valid_until_after_quote_date',
  'expenses_paid_by_is_a_partner'
)
ORDER BY table_name;

SELECT event_object_table AS table_name, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_name LIKE '%_set_updated_at'
ORDER BY table_name;

SELECT tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
