-- ============================================================
-- Onyxx Tech - Supabase Schema Migration (Consolidated)
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- 1. PROJECTS TABLE: Add deposit/final payment tracking columns
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deposit_received BOOLEAN DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deposit_received_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS final_payment_amount NUMERIC DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS final_received BOOLEAN DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS final_payment_received_date DATE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS notes TEXT;

-- 2. EXPENSES TABLE: Add recurring type, linked project, invoice link, notes
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS recurring_type TEXT DEFAULT 'None';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS linked_project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS invoice_link TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS notes TEXT;

-- 3. STORAGE BUCKETS: Create public buckets for files
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('showcase', 'showcase', true)
ON CONFLICT (id) DO NOTHING;

-- 4. SHOWCASE PROJECTS TABLE
CREATE TABLE IF NOT EXISTS showcase_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    tech_stack TEXT[] DEFAULT '{}',
    image_url TEXT,
    category TEXT,
    client TEXT,
    github_url TEXT,
    live_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on showcase_projects
ALTER TABLE showcase_projects ENABLE ROW LEVEL SECURITY;

-- Showcase Projects Policies
DROP POLICY IF EXISTS "Allow public read access to showcase_projects" ON showcase_projects;
CREATE POLICY "Allow public read access to showcase_projects" 
ON showcase_projects FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow auth admin insert access to showcase_projects" ON showcase_projects;
CREATE POLICY "Allow auth admin insert access to showcase_projects" 
ON showcase_projects FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow auth admin update access to showcase_projects" ON showcase_projects;
CREATE POLICY "Allow auth admin update access to showcase_projects" 
ON showcase_projects FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow auth admin delete access to showcase_projects" ON showcase_projects;
CREATE POLICY "Allow auth admin delete access to showcase_projects" 
ON showcase_projects FOR DELETE USING (auth.role() = 'authenticated');

-- 5. SYSTEM SETTINGS TABLE
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS on system_settings
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- System Settings Policies
DROP POLICY IF EXISTS "Allow public read access to system_settings" ON system_settings;
CREATE POLICY "Allow public read access to system_settings" 
ON system_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow auth admin insert access to system_settings" ON system_settings;
CREATE POLICY "Allow auth admin insert access to system_settings" 
ON system_settings FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow auth admin update access to system_settings" ON system_settings;
CREATE POLICY "Allow auth admin update access to system_settings" 
ON system_settings FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow auth admin delete access to system_settings" ON system_settings;
CREATE POLICY "Allow auth admin delete access to system_settings" 
ON system_settings FOR DELETE USING (auth.role() = 'authenticated');

-- Insert default system settings
INSERT INTO system_settings (key, value) VALUES 
('company_profile', '{"name": "Onyxx Tech", "sst_rate": 8, "currency": "MYR"}'::jsonb),
('partner_split', '{"Kunacosta": 50, "Rooben": 50}'::jsonb),
('financial_targets', '{"revenue_target": 15000, "expense_target": 5000}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 6. STORAGE OBJECTS RLS POLICIES
-- Drop and recreate storage access policies for showcase, avatars, and receipts buckets
DROP POLICY IF EXISTS "Allow public read access to storage objects" ON storage.objects;
CREATE POLICY "Allow public read access to storage objects" 
ON storage.objects FOR SELECT 
USING ( bucket_id IN ('showcase', 'avatars', 'receipts') );

DROP POLICY IF EXISTS "Allow auth upload access to storage objects" ON storage.objects;
CREATE POLICY "Allow auth upload access to storage objects" 
ON storage.objects FOR INSERT 
TO authenticated 
WITH CHECK ( bucket_id IN ('showcase', 'avatars', 'receipts') );

DROP POLICY IF EXISTS "Allow auth update access to storage objects" ON storage.objects;
CREATE POLICY "Allow auth update access to storage objects" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING ( bucket_id IN ('showcase', 'avatars', 'receipts') )
WITH CHECK ( bucket_id IN ('showcase', 'avatars', 'receipts') );

DROP POLICY IF EXISTS "Allow auth delete access to storage objects" ON storage.objects;
CREATE POLICY "Allow auth delete access to storage objects" 
ON storage.objects FOR DELETE 
TO authenticated 
USING ( bucket_id IN ('showcase', 'avatars', 'receipts') );

-- 7. PARTNER WITHDRAWALS TABLE
CREATE TABLE IF NOT EXISTS partner_withdrawals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    partner TEXT NOT NULL, -- 'Kunacosta' or 'Rooben'
    amount NUMERIC NOT NULL CHECK (amount > 0),
    date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE partner_withdrawals ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Allow public read access to partner_withdrawals" ON partner_withdrawals;
CREATE POLICY "Allow public read access to partner_withdrawals" 
ON partner_withdrawals FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow auth admin insert access to partner_withdrawals" ON partner_withdrawals;
CREATE POLICY "Allow auth admin insert access to partner_withdrawals" 
ON partner_withdrawals FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow auth admin update access to partner_withdrawals" ON partner_withdrawals;
CREATE POLICY "Allow auth admin update access to partner_withdrawals" 
ON partner_withdrawals FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow auth admin delete access to partner_withdrawals" ON partner_withdrawals;
CREATE POLICY "Allow auth admin delete access to partner_withdrawals" 
ON partner_withdrawals FOR DELETE USING (auth.role() = 'authenticated');
