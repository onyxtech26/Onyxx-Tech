-- ============================================================
-- Onyxx Tech — Migration 02: financial rebuild (FRESH START)
--
-- Clears the financial data so it can be re-entered against the new model,
-- then builds the schema: project payments, add-ons and quotations.
--
-- Run section 0 on its own FIRST and save the output. Everything after it can
-- go in one paste.
--
-- Written against the live database. Verified before writing:
--   projects  3 rows, expenses 10 rows, partner_withdrawals 0 rows
--   expenses.paid_by is Kunacosta (8) or Rooben (2) — no NULLs
--   projects/expenses have NO public SELECT policy (already private)
--   partner_withdrawals + system_settings DO have USING (true) — closed below
-- ============================================================


-- ============================================================
-- 0. BACK UP  ***RUN THIS ALONE, FIRST, AND SAVE THE RESULT***
-- ============================================================
-- The only copy that will exist after section 1. Even though you are
-- re-keying, keep it — re-typing from a saved copy beats from memory.
-- Click each result cell, copy, paste into a text file.

SELECT json_agg(p) AS projects_backup FROM projects p;
SELECT json_agg(e) AS expenses_backup FROM expenses e;


-- ============================================================
-- ↓↓↓ EVERYTHING BELOW CAN BE PASTED AND RUN IN ONE GO ↓↓↓
-- ============================================================


-- ============================================================
-- 1. CLEAR THE FINANCIAL DATA  ***POINT OF NO RETURN***
-- ============================================================
-- Guarded through to_regclass so this file is safe to re-run and does not
-- error on tables that do not exist yet the first time through.
--
-- NOT cleared: services, showcase_projects and team_members — the public
-- website renders its Services, Work and Founders sections from those three
-- with the anon key, so clearing them would blank the live site.
-- Also kept: system_settings, which holds the company profile, the 50/50
-- split and the financial targets. That is configuration, not data.
DO $$
BEGIN
  IF to_regclass('public.project_payments') IS NOT NULL THEN DELETE FROM project_payments; END IF;
  IF to_regclass('public.project_addons')   IS NOT NULL THEN DELETE FROM project_addons;   END IF;
  IF to_regclass('public.quotations')       IS NOT NULL THEN DELETE FROM quotations;       END IF;
END $$;

DELETE FROM expenses;
DELETE FROM partner_withdrawals;
DELETE FROM projects;


-- ============================================================
-- 2. SECURITY — close the two genuinely public financial tables
-- ============================================================
-- Checked against pg_policies rather than assumed:
--   projects, expenses   only "ALL to {authenticated}", no public SELECT.
--                        Already private — deliberately left alone.
--   partner_withdrawals  had "Allow public read access" USING (true)
--   system_settings      had "Allow public read access" USING (true)
--
-- Only those last two need closing, and neither is read by the public site.

DROP POLICY IF EXISTS "Allow public read access to partner_withdrawals" ON partner_withdrawals;
DROP POLICY IF EXISTS "Allow authenticated read access to partner_withdrawals" ON partner_withdrawals;
CREATE POLICY "Allow authenticated read access to partner_withdrawals"
ON partner_withdrawals FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow public read access to system_settings" ON system_settings;
DROP POLICY IF EXISTS "Allow authenticated read access to system_settings" ON system_settings;
CREATE POLICY "Allow authenticated read access to system_settings"
ON system_settings FOR SELECT USING (auth.role() = 'authenticated');

-- The `receipts` bucket stays public for now. Receipts are uploaded with
-- getPublicUrl() and that public URL is stored in expenses.invoice_link and
-- rendered as a plain link, so making the bucket private would break every
-- existing receipt. Fixing it properly means storing the object path and
-- signing on click — a dashboard change, not a migration. Tracked separately.


-- ============================================================
-- 3. QUOTATIONS BUCKET — private from the start
-- ============================================================
-- New, so there are no public URLs to break. A quotation shows what you charge
-- a specific client, so it is read through short-lived signed URLs.
INSERT INTO storage.buckets (id, name, public) VALUES ('quotations', 'quotations', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Allow authenticated access to quotation files" ON storage.objects;
CREATE POLICY "Allow authenticated access to quotation files"
ON storage.objects FOR ALL
TO authenticated
USING ( bucket_id = 'quotations' )
WITH CHECK ( bucket_id = 'quotations' );


-- ============================================================
-- 4. PROJECT PAYMENTS — arbitrary installments
-- ============================================================
-- Replaces the fixed deposit + final pair, which could only ever express two
-- payments. A project now has as many as the client actually agreed to.
CREATE TABLE IF NOT EXISTS project_payments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label         TEXT NOT NULL DEFAULT 'Installment',
    amount        NUMERIC NOT NULL CHECK (amount > 0),
    due_date      DATE,
    received      BOOLEAN NOT NULL DEFAULT false,
    received_date DATE,
    method        TEXT,
    notes         TEXT,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

    -- A received payment must say when. Revenue is reported by month, so a
    -- dateless received payment would silently vanish from every chart.
    CONSTRAINT project_payments_received_needs_date
      CHECK (received = false OR received_date IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS project_payments_project_id_idx ON project_payments(project_id);
CREATE INDEX IF NOT EXISTS project_payments_received_idx   ON project_payments(received, due_date);

ALTER TABLE project_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated all access to project_payments" ON project_payments;
CREATE POLICY "authenticated all access to project_payments"
ON project_payments FOR ALL TO authenticated
USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');


-- ============================================================
-- 5. PROJECT ADD-ONS — scope agreed after the original quote
-- ============================================================
CREATE TABLE IF NOT EXISTS project_addons (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount      NUMERIC NOT NULL CHECK (amount >= 0),
    date        DATE,
    billed      BOOLEAN NOT NULL DEFAULT false,
    notes       TEXT,
    created_at  TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS project_addons_project_id_idx ON project_addons(project_id);

ALTER TABLE project_addons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated all access to project_addons" ON project_addons;
CREATE POLICY "authenticated all access to project_addons"
ON project_addons FOR ALL TO authenticated
USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');


-- ============================================================
-- 6. QUOTATIONS — header totals plus the document you sent
-- ============================================================
-- project_id is nullable: a quote usually exists before the project does, and
-- may never be accepted.
CREATE TABLE IF NOT EXISTS quotations (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   UUID REFERENCES projects(id) ON DELETE SET NULL,
    client       TEXT,
    quote_number TEXT,
    quote_date   DATE,
    valid_until  DATE,
    subtotal     NUMERIC DEFAULT 0,
    sst_amount   NUMERIC DEFAULT 0,
    total        NUMERIC NOT NULL DEFAULT 0 CHECK (total >= 0),
    status       TEXT NOT NULL DEFAULT 'Draft'
                 CHECK (status IN ('Draft', 'Sent', 'Accepted', 'Declined')),
    file_url     TEXT,       -- object path in the private `quotations` bucket
    notes        TEXT,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS quotations_project_id_idx ON quotations(project_id);
CREATE INDEX IF NOT EXISTS quotations_status_idx     ON quotations(status);

ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated all access to quotations" ON quotations;
CREATE POLICY "authenticated all access to quotations"
ON quotations FOR ALL TO authenticated
USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');


-- ============================================================
-- 7. EXPENSES — paid_by is now load-bearing
-- ============================================================
-- Partner balances are computed from who fronted each cost, so a missing
-- paid_by silently corrupts both partners' figures.
--
-- The IS NOT NULL is not redundant: a CHECK only rejects a row when it
-- evaluates to FALSE, and `NULL IN ('Kunacosta','Rooben')` evaluates to NULL —
-- so a bare IN() would happily accept a blank.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS paid_by TEXT;

DO $$
BEGIN
  ALTER TABLE expenses
    ADD CONSTRAINT expenses_paid_by_is_a_partner
    CHECK (paid_by IS NOT NULL AND paid_by IN ('Kunacosta', 'Rooben'));
EXCEPTION
  WHEN duplicate_object THEN NULL;   -- already applied
END $$;


-- ============================================================
-- 8. RETIRE THE OLD TWO-PAYMENT COLUMNS
-- ============================================================
-- Unconditionally safe now: section 1 emptied the table, so there is nothing
-- to lose. Superseded by project_payments.
ALTER TABLE projects DROP COLUMN IF EXISTS deposit_amount;
ALTER TABLE projects DROP COLUMN IF EXISTS deposit_received;
ALTER TABLE projects DROP COLUMN IF EXISTS deposit_received_date;
ALTER TABLE projects DROP COLUMN IF EXISTS final_payment_amount;
ALTER TABLE projects DROP COLUMN IF EXISTS final_received;
ALTER TABLE projects DROP COLUMN IF EXISTS final_payment_received_date;


-- ============================================================
-- 9. VERIFY
-- ============================================================
-- Expect: financial tables at 0, website content untouched at 5 / 10 / 2.
SELECT 'projects' AS t, count(*) FROM projects
UNION ALL SELECT 'expenses',            count(*) FROM expenses
UNION ALL SELECT 'partner_withdrawals', count(*) FROM partner_withdrawals
UNION ALL SELECT 'project_payments',    count(*) FROM project_payments
UNION ALL SELECT 'project_addons',      count(*) FROM project_addons
UNION ALL SELECT 'quotations',          count(*) FROM quotations
UNION ALL SELECT 'services',            count(*) FROM services
UNION ALL SELECT 'showcase_projects',   count(*) FROM showcase_projects
UNION ALL SELECT 'team_members',        count(*) FROM team_members;

-- Expect: partner_withdrawals + system_settings now require authentication;
-- services, team_members and showcase_projects still public.
SELECT tablename, policyname, cmd, qual::text
FROM pg_policies
WHERE schemaname = 'public' AND cmd IN ('SELECT', 'ALL')
  AND tablename IN ('projects', 'expenses', 'partner_withdrawals', 'system_settings',
                    'showcase_projects', 'services', 'team_members',
                    'project_payments', 'project_addons', 'quotations')
ORDER BY tablename, cmd;

-- Expect: quotations = false; showcase, avatars, receipts = true.
SELECT id, public FROM storage.buckets ORDER BY id;
