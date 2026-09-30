-- ============================================================
-- Onyxx Tech — Supabase Migration 06: public contact form
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
--
-- *** RUN THIS BEFORE THE CONTACT FORM CAN WORK ***
--
-- The public site had no contact form at all before this: /contact offered a
-- mailto: link and two WhatsApp links, which leaves no record of who enquired
-- and loses anyone whose desktop has no mail client configured.
--
-- This adds the one table that form writes into, and the Messages tab in the
-- admin dashboard reads back.
--
-- Independent of 01-05. Touches no existing table.
-- ============================================================


-- ============================================================
-- 1. THE TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS contact_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT,
  company       TEXT,
  project_type  TEXT,
  message       TEXT NOT NULL,

  -- Which page they were reading when they sent it. Tells you whether the
  -- enquiry came off /chatbots or /ai-agents, which is the cheapest possible
  -- read on which service page is actually earning its place.
  source_page   TEXT,

  -- Workflow state, owned entirely by the dashboard.
  status        TEXT NOT NULL DEFAULT 'new',
  notes         TEXT,

  -- Length caps mirrored in common.js so an over-long field is explained in
  -- the form rather than arriving as a raw Postgres error. Enforced here too,
  -- because the client-side copy is advisory — anyone can post directly to
  -- PostgREST with the anon key, which is public by design.
  CONSTRAINT contact_messages_name_len    CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT contact_messages_email_len   CHECK (char_length(email) BETWEEN 3 AND 200),
  CONSTRAINT contact_messages_phone_len   CHECK (phone   IS NULL OR char_length(phone)   <= 40),
  CONSTRAINT contact_messages_company_len CHECK (company IS NULL OR char_length(company) <= 160),
  CONSTRAINT contact_messages_type_len    CHECK (project_type IS NULL OR char_length(project_type) <= 60),
  CONSTRAINT contact_messages_msg_len     CHECK (char_length(message) BETWEEN 1 AND 5000),
  CONSTRAINT contact_messages_source_len  CHECK (source_page IS NULL OR char_length(source_page) <= 200),
  CONSTRAINT contact_messages_status_ck   CHECK (status IN ('new','read','replied','archived','spam'))
);

-- The inbox is always read newest-first.
CREATE INDEX IF NOT EXISTS contact_messages_created_idx
  ON contact_messages (created_at DESC);

-- "How many unread?" runs on every dashboard load.
CREATE INDEX IF NOT EXISTS contact_messages_status_idx
  ON contact_messages (status);


-- ============================================================
-- 2. ROW LEVEL SECURITY
-- ============================================================
-- This is the only table on the project a stranger is allowed to write to, so
-- the policies are deliberately lopsided:
--
--   anon  -> INSERT only. No SELECT, so one visitor cannot read another
--            visitor's enquiry back out. This matters more than it looks:
--            the anon key ships in the page source, so "anon" means anyone
--            on the internet.
--   admin -> full read/write, gated on the same is_admin() used everywhere
--            else (migration 03).
--
-- Remember that RLS denial is HTTP 200 with zero rows, not an error. If the
-- dashboard inbox looks empty, check is_admin() before assuming nobody wrote.
ALTER TABLE contact_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone can send a message" ON contact_messages;
CREATE POLICY "anyone can send a message"
  ON contact_messages
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- A submission cannot pre-set its own workflow state. Without this, a
    -- crafted POST could arrive already marked 'archived' and never be seen.
    status = 'new'
    AND notes IS NULL
  );

DROP POLICY IF EXISTS "admins read messages" ON contact_messages;
CREATE POLICY "admins read messages"
  ON contact_messages
  FOR SELECT
  TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "admins update messages" ON contact_messages;
CREATE POLICY "admins update messages"
  ON contact_messages
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admins delete messages" ON contact_messages;
CREATE POLICY "admins delete messages"
  ON contact_messages
  FOR DELETE
  TO authenticated
  USING (is_admin());


-- ============================================================
-- 3. VERIFY
-- ============================================================
-- Expect: four policies, and a row count you can compare against the form.
--
--   SELECT policyname, cmd, roles
--     FROM pg_policies
--    WHERE tablename = 'contact_messages'
--    ORDER BY cmd;
--
--   SELECT count(*) FROM contact_messages;
--
-- Then submit the form on /contact once and confirm the count goes up by one.
-- If the insert is refused, the usual cause is that is_admin() does not exist
-- yet — run migration 03 first.
