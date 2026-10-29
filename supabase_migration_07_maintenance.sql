-- ============================================================
-- Onyxx Tech — Migration 07: maintenance payments
--
-- Maintenance is recurring income for a finished project. It is NOT part of
-- the build price, so it must not count against what the client owes on the
-- contract — but it IS money in the account, so it still counts as collected
-- (partner pool, cash, revenue by month).
--
-- Before this, a maintenance payment could only go in the project's payment
-- schedule, where it read as the client overpaying. SOLE showed exactly that:
-- 4 x RM875 = RM3,500 contract, plus RM400 maintenance = "overpaid RM400".
--
-- Design:
--   project_payments.kind        'project' (default) or 'maintenance'.
--                                Re-uses the payments table so every existing
--                                cash/revenue figure picks maintenance up with
--                                no second code path.
--   project_payments.period_end  for a maintenance row, the last day it covers.
--                                due_date is the first day / when it is due.
--   projects.maintenance_*       the plan: fee, cycle, start, optional end.
--                                Used to work out the next due date. Optional:
--                                a payment can be recorded without a plan.
--
-- Safe to re-run. Touches no policies, so it is safe either side of 03.
-- ============================================================

ALTER TABLE project_payments ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'project';
ALTER TABLE project_payments ADD COLUMN IF NOT EXISTS period_end DATE;

DO $$
BEGIN
  ALTER TABLE project_payments
    ADD CONSTRAINT project_payments_kind_valid CHECK (kind IN ('project', 'maintenance'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE project_payments
    ADD CONSTRAINT project_payments_period_order
    CHECK (period_end IS NULL OR due_date IS NULL OR period_end >= due_date);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS project_payments_kind_idx ON project_payments(kind, project_id);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS maintenance_fee   NUMERIC;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS maintenance_cycle TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS maintenance_start DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS maintenance_end   DATE;

DO $$
BEGIN
  ALTER TABLE projects
    ADD CONSTRAINT projects_maintenance_cycle_valid
    CHECK (maintenance_cycle IS NULL
           OR maintenance_cycle IN ('monthly', 'quarterly', 'half-yearly', 'yearly'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE projects
    ADD CONSTRAINT projects_maintenance_fee_positive
    CHECK (maintenance_fee IS NULL OR maintenance_fee > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ------------------------------------------------------------
-- Reclassify the one maintenance payment already keyed into a schedule.
-- Matched on label so it is a no-op on a fresh environment.
-- ------------------------------------------------------------
UPDATE project_payments
   SET kind = 'maintenance'
 WHERE kind = 'project'
   AND lower(trim(label)) = 'maintenance';


-- ------------------------------------------------------------
-- VERIFY — expect SOLE's RM400 row as kind = maintenance.
-- ------------------------------------------------------------
SELECT p.name, pp.label, pp.amount, pp.kind, pp.due_date, pp.received_date
  FROM project_payments pp JOIN projects p ON p.id = pp.project_id
 WHERE pp.kind = 'maintenance';
