-- ============================================================
-- Onyxx Tech — Supabase Migration 03: admin allowlist
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
--
-- WHY THIS EXISTS
--
-- Every policy written so far keys on `auth.role() = 'authenticated'`, which
-- means "any signed-in user", not "a partner". That is only as strong as the
-- gate on becoming a signed-in user — and there is currently no gate:
--
--   GET /auth/v1/settings  ->  "disable_signup": false
--
-- So anyone who has the anon key (it is in admin-login.html, public by design)
-- can POST /auth/v1/signup with their own email, click the confirmation link in
-- their own inbox, and land inside `authenticated`. From there the existing
-- policies grant read/write on projects, expenses, partner_withdrawals,
-- project_payments, project_addons, quotations and system_settings, plus write
-- on services / showcase_projects / team_members, which the live marketing site
-- renders to visitors.
--
-- `mailer_autoconfirm: false` is not a barrier here. It only requires the
-- attacker to confirm an address they already control.
--
-- TWO THINGS ARE NEEDED, AND THIS FILE IS ONLY THE SECOND
--
--   1. Turn OFF public signup. Dashboard > Authentication > Sign In / Providers
--      > Email > "Allow new users to sign up" -> off. Cannot be done from SQL.
--   2. Run this file, so that even a signed-in non-partner has no rights.
--
-- Do both. (1) alone leaves the app one config toggle away from wide open;
-- (2) alone still lets strangers create accounts, they just cannot do anything.
--
-- BEFORE RUNNING: check who already exists.
--     SELECT id, email, created_at, last_sign_in_at FROM auth.users ORDER BY created_at;
-- If there is an account you do not recognise, delete it in
-- Dashboard > Authentication > Users before running section 2.
--
-- ORDER MATTERS, AND NOTHING ENFORCES IT
--
-- There is no migration runner here, just three files someone pastes. 03 must
-- always be the LAST one run. Re-running 03 is safe and actively repairs drift
-- — it enumerates pg_policies rather than guessing policy names — but
-- re-running 01 or 02 after it silently re-grants access to any signed-in user,
-- because Postgres OR-s permissive policies together. So:
--
--     If you run 01 or 02 for any reason, re-run 03 immediately afterwards.
--
-- IF YOU LOCK YOURSELF OUT
--
-- `admin_users` deliberately has no INSERT policy, so you cannot fix this from
-- the app. Use the SQL Editor, which connects as `postgres` — the table's owner,
-- and therefore exempt from RLS:
--
--     INSERT INTO admin_users (user_id, email)
--     SELECT id, lower(email) FROM auth.users WHERE lower(email) = lower('you@example.com')
--     ON CONFLICT (user_id) DO NOTHING;
--
-- BEFORE YOU DISABLE SIGNUP, READ THIS
--
-- Turning signup off means the only way to create the second partner's account
-- is Dashboard > Authentication > Users > Add user. Choose "Create new user"
-- and set a password directly — do NOT choose "Send invitation", because the
-- invite email's link resolves against the project's Site URL, which is still
-- http://localhost:3000 and therefore dead. Fix the Site URL first (see below).
-- ============================================================


-- ============================================================
-- 1. THE ALLOWLIST
-- ============================================================
CREATE TABLE IF NOT EXISTS admin_users (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- An admin may see the roster. Nobody can change it through the API at all —
-- there is deliberately no INSERT/UPDATE/DELETE policy, so adding a partner is
-- a SQL Editor action. That keeps a compromised dashboard session from being
-- able to promote a second account for itself.
DROP POLICY IF EXISTS "Admins can read the admin roster" ON admin_users;
CREATE POLICY "Admins can read the admin roster"
ON admin_users FOR SELECT
TO authenticated
USING ( user_id = auth.uid() );


-- SECURITY DEFINER runs this as the function's owner (`postgres`), which owns
-- admin_users and is therefore exempt from its RLS.
--
-- There is no recursion today — the policy above is `user_id = auth.uid()` and
-- does not call is_admin(). SECURITY DEFINER is what keeps it that way if
-- anyone later "tightens" that policy to USING (is_admin()).
--
-- THE INVARIANT THIS DEPENDS ON: owners bypass RLS *unless* the table is set to
-- FORCE ROW LEVEL SECURITY. If admin_users is ever FORCEd, or this function's
-- owner changes, is_admin() returns false for everyone and every table below
-- locks out at once. Do not change either without re-reading this.
--
-- STABLE so Postgres evaluates it once per statement instead of once per row of
-- every table. SET search_path pins resolution of the unqualified admin_users;
-- pg_temp is listed LAST deliberately, because Postgres otherwise searches temp
-- objects first and a temp table named admin_users could shadow the real one.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid());
$$;

REVOKE ALL ON FUNCTION is_admin() FROM public;
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;


-- ============================================================
-- 2. SEED THE ALLOWLIST  <<< EDIT THE EMAIL LIST BEFORE RUNNING >>>
-- ============================================================
-- Put both partners' login emails here. Anything not listed loses access the
-- moment section 3 runs, INCLUDING YOU — so get this right first.
--
-- lower() on both sides because the comparison is otherwise case-sensitive: a
-- stored 'Kunacosta0702@gmail.com' would match nothing, the INSERT would add
-- zero rows, and section 3 would then lock out both partners.
INSERT INTO admin_users (user_id, email)
SELECT id, lower(email) FROM auth.users
WHERE lower(email) IN (
    lower('kunacosta0702@gmail.com')
    -- , lower('rooben@example.com')   -- <-- replace with Rooben's real login email
)
ON CONFLICT (user_id) DO NOTHING;


-- HARD STOP if the seed did not take.
--
-- A bare `SELECT ... FROM admin_users` here would NOT protect you: the SQL
-- Editor renders only the last statement's result, and nothing halts a script
-- on an unexpected row count. This raises instead, and because the editor wraps
-- a submitted script in a single transaction, the exception rolls back
-- everything — section 3 never runs.
--
-- Lower EXPECTED to 1 only if you are deliberately running with one partner.
DO $$
DECLARE
  expected CONSTANT INT := 2;
  n INT;
BEGIN
  SELECT count(*) INTO n FROM admin_users;
  IF n < expected THEN
    RAISE EXCEPTION
      'admin_users holds % row(s), expected %. Aborting: running section 3 now would lock out a partner. Check the email list above against: SELECT id, email FROM auth.users;',
      n, expected;
  END IF;
  RAISE NOTICE 'admin_users seeded with % row(s) — proceeding.', n;
END $$;


-- ============================================================
-- 3. REPOINT EVERY POLICY AT is_admin()
-- ============================================================
-- Same shape throughout: FOR ALL, TO authenticated, USING + WITH CHECK, so a
-- non-admin session sees zero rows and every write is rejected.

-- --- financial tables: admin-only, no public read at all ---
DO $$
DECLARE
  t TEXT;
  drops TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
      'projects', 'expenses', 'partner_withdrawals',
      'project_payments', 'project_addons', 'quotations', 'system_settings'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skipping %, table does not exist', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Drop whatever is there. Policy names have drifted across migrations and
    -- the dashboard UI, so enumerate rather than guess — that is what makes
    -- re-running this file repair drift instead of layering on top of it.
    SELECT string_agg(format('DROP POLICY IF EXISTS %I ON public.%I;', policyname, t), ' ')
      INTO drops
      FROM pg_policies WHERE schemaname = 'public' AND tablename = t;

    -- NULL when the table has RLS on but no policies at all; EXECUTE '' is
    -- version-dependent, so skip rather than rely on it.
    IF drops IS NOT NULL THEN
      EXECUTE drops;
    END IF;

    EXECUTE format($f$
      CREATE POLICY "Admin full access to %1$s"
      ON public.%1$I FOR ALL TO authenticated
      USING ( is_admin() ) WITH CHECK ( is_admin() );
    $f$, t);
  END LOOP;
END $$;


-- --- site content: public reads, admin writes ---
-- These three ARE rendered to visitors, so anonymous SELECT has to stay.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['services', 'showcase_projects', 'team_members'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skipping %, table does not exist', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE (
      SELECT coalesce(string_agg(format('DROP POLICY IF EXISTS %I ON %I;', policyname, t), ' '), '')
      FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    );

    EXECUTE format($f$
      CREATE POLICY "Public read access to %1$s"
      ON %1$I FOR SELECT USING ( true );
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY "Admin write access to %1$s"
      ON %1$I FOR ALL TO authenticated
      USING ( is_admin() ) WITH CHECK ( is_admin() );
    $f$, t);
  END LOOP;
END $$;


-- --- storage ---
-- avatars + showcase are site assets and stay publicly readable.
-- receipts + quotations are financial paperwork: admin-only, read through
-- short-lived signed URLs from the dashboard.
DROP POLICY IF EXISTS "Allow public read access to storage objects" ON storage.objects;
DROP POLICY IF EXISTS "Public read of site asset buckets" ON storage.objects;
CREATE POLICY "Public read of site asset buckets"
ON storage.objects FOR SELECT
USING ( bucket_id IN ('showcase', 'avatars') );

DROP POLICY IF EXISTS "Allow auth upload access to storage objects" ON storage.objects;
DROP POLICY IF EXISTS "Allow auth update access to storage objects" ON storage.objects;
DROP POLICY IF EXISTS "Allow auth delete access to storage objects" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated access to quotation files" ON storage.objects;
DROP POLICY IF EXISTS "Admin access to onyxx buckets" ON storage.objects;
CREATE POLICY "Admin access to onyxx buckets"
ON storage.objects FOR ALL
TO authenticated
USING ( bucket_id IN ('showcase', 'avatars', 'receipts', 'quotations') AND is_admin() )
WITH CHECK ( bucket_id IN ('showcase', 'avatars', 'receipts', 'quotations') AND is_admin() );


-- ============================================================
-- 4. VERIFY
-- ============================================================
-- Every policy below should read is_admin(), except the three "Public read
-- access to …" rows for services / showcase_projects / team_members and the
-- site-asset storage row.
SELECT tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
ORDER BY tablename, policyname;
