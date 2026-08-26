/*
# FinControl AI — initial schema

1. New Tables
- `profiles`: one row per auth user, holds the role (admin/viewer).
  - `id` (uuid, PK, references auth.users)
  - `email` (text)
  - `role` (text: 'admin' | 'viewer', default 'viewer')
  - `created_at` (timestamptz)
- `transactions`: the core financial ledger.
  - `id` (uuid, PK)
  - `user_id` (uuid, owner, defaults to auth.uid())
  - `date` (date, not null)
  - `amount` (numeric(14,2), not null; positive = income, negative = expense)
  - `category` (text, nullable — auto-categorization fills this)
  - `description` (text)
  - `vendor` (text)
  - `payment_method` (text: cash/credit_card/debit_card/bank_transfer/check/other)
  - `status` (text: pending/cleared/flagged/approved/rejected/escalated)
  - `is_anomaly` (boolean, default false)
  - `anomaly_reason` (text, nullable)
  - `anomaly_confidence` (integer 0-100, nullable)
  - `reviewed_by` (uuid, nullable)
  - `reviewed_at` (timestamptz, nullable)
  - `created_at` (timestamptz)
- `reconciliation_sets`: uploaded lists for the reconciliation tool.
  - `id` (uuid, PK)
  - `user_id` (uuid, owner)
  - `name` (text)
  - `kind` (text: 'invoices' | 'bank')
  - `created_at` (timestamptz)
- `reconciliation_entries`: individual rows within a set.
  - `id` (uuid, PK)
  - `set_id` (uuid FK -> reconciliation_sets)
  - `date` (date)
  - `amount` (numeric)
  - `vendor` (text)
  - `description` (text)
  - `match_status` (text: unmatched/matched/partial)
  - `matched_set_id` (uuid, nullable)
  - `matched_amount_diff` (numeric, nullable)
  - `matched_date_diff_days` (integer, nullable)

2. Security
- RLS enabled on all tables.
- profiles: each user reads/updates only their own row. INSERT via trigger only (users cannot insert directly).
- transactions: owner-scoped CRUD (authenticated).
- reconciliation_sets + reconciliation_entries: owner-scoped through parent.
- `is_admin()` SECURITY DEFINER function so RLS policies can check role without exposing the profiles table.

3. Helpers
- `handle_new_user()` trigger: when a new auth user is created, insert a profile row.
  The FIRST registered user is automatically promoted to admin so the app has an admin on first run.
- `is_admin()` function: returns true if the calling user's profile role is 'admin'.

4. Important notes
- `user_id` defaults to `auth.uid()` so client inserts that omit it still satisfy RLS.
- Email confirmation stays OFF (default).
- The first-user-is-admin rule runs inside the trigger; subsequent users get 'viewer'.
*/

-- ---------- profiles ----------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','viewer')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON public.profiles;
CREATE POLICY "select_own_profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;
CREATE POLICY "update_own_profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- NOTE: no INSERT/DELETE policies on profiles — the handle_new_user trigger
-- (SECURITY DEFINER) is the only path that creates profile rows, so users
-- cannot forge roles by inserting directly.

-- ---------- is_admin() helper ----------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ---------- transactions ----------
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric(14,2) NOT NULL,
  category text,
  description text,
  vendor text,
  payment_method text NOT NULL DEFAULT 'other' CHECK (payment_method IN ('cash','credit_card','debit_card','bank_transfer','check','other')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','cleared','flagged','approved','rejected','escalated')),
  is_anomaly boolean NOT NULL DEFAULT false,
  anomaly_reason text,
  anomaly_confidence integer CHECK (anomaly_confidence BETWEEN 0 AND 100),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_transactions" ON public.transactions;
CREATE POLICY "select_own_transactions" ON public.transactions
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_transactions" ON public.transactions;
CREATE POLICY "insert_own_transactions" ON public.transactions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_transactions" ON public.transactions;
CREATE POLICY "update_own_transactions" ON public.transactions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_transactions" ON public.transactions;
CREATE POLICY "delete_own_transactions" ON public.transactions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_category ON public.transactions(user_id, category);
CREATE INDEX IF NOT EXISTS idx_transactions_anomaly ON public.transactions(user_id, is_anomaly) WHERE is_anomaly = true;

-- ---------- reconciliation ----------
CREATE TABLE IF NOT EXISTS public.reconciliation_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('invoices','bank')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_recsets" ON public.reconciliation_sets;
CREATE POLICY "select_own_recsets" ON public.reconciliation_sets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_recsets" ON public.reconciliation_sets;
CREATE POLICY "insert_own_recsets" ON public.reconciliation_sets
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_recsets" ON public.reconciliation_sets;
CREATE POLICY "update_own_recsets" ON public.reconciliation_sets
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_recsets" ON public.reconciliation_sets;
CREATE POLICY "delete_own_recsets" ON public.reconciliation_sets
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.reconciliation_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL REFERENCES public.reconciliation_sets(id) ON DELETE CASCADE,
  date date NOT NULL,
  amount numeric(14,2) NOT NULL,
  vendor text,
  description text,
  match_status text NOT NULL DEFAULT 'unmatched' CHECK (match_status IN ('unmatched','matched','partial')),
  matched_set_id uuid,
  matched_amount_diff numeric(14,2),
  matched_date_diff_days integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.reconciliation_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_recientries" ON public.reconciliation_entries;
CREATE POLICY "select_own_recientries" ON public.reconciliation_entries
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reconciliation_sets s WHERE s.id = set_id AND s.user_id = auth.uid()));

DROP POLICY IF EXISTS "insert_own_recientries" ON public.reconciliation_entries;
CREATE POLICY "insert_own_recientries" ON public.reconciliation_entries
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.reconciliation_sets s WHERE s.id = set_id AND s.user_id = auth.uid()));

DROP POLICY IF EXISTS "update_own_recientries" ON public.reconciliation_entries;
CREATE POLICY "update_own_recientries" ON public.reconciliation_entries
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reconciliation_sets s WHERE s.id = set_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.reconciliation_sets s WHERE s.id = set_id AND s.user_id = auth.uid()));

DROP POLICY IF EXISTS "delete_own_recientries" ON public.reconciliation_entries;
CREATE POLICY "delete_own_recientries" ON public.reconciliation_entries
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reconciliation_sets s WHERE s.id = set_id AND s.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_recientries_set ON public.reconciliation_entries(set_id);

-- ---------- handle_new_user trigger ----------
-- First user becomes admin automatically; later users become viewers.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count integer;
BEGIN
  SELECT count(*) INTO user_count FROM public.profiles;
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, CASE WHEN user_count = 0 THEN 'admin' ELSE 'viewer' END)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();