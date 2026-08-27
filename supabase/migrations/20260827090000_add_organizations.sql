-- Multi-organization access model for FinControl AI.

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

INSERT INTO public.organizations (name)
VALUES ('Legacy Organization')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id uuid;
UPDATE public.profiles
SET organization_id = (SELECT id FROM public.organizations WHERE name = 'Legacy Organization')
WHERE organization_id IS NULL;
ALTER TABLE public.profiles ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_organization_id_fkey,
  ADD CONSTRAINT profiles_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid();
$$;

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

DROP POLICY IF EXISTS "select_own_organization" ON public.organizations;
CREATE POLICY "select_own_organization" ON public.organizations
  FOR SELECT TO authenticated USING (id = public.current_organization_id());

DROP POLICY IF EXISTS "update_own_profile" ON public.profiles;

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS organization_id uuid;
UPDATE public.transactions t
SET organization_id = p.organization_id
FROM public.profiles p
WHERE p.id = t.user_id AND t.organization_id IS NULL;
ALTER TABLE public.transactions ALTER COLUMN organization_id SET DEFAULT public.current_organization_id();
ALTER TABLE public.transactions ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.transactions
  DROP CONSTRAINT IF EXISTS transactions_organization_id_fkey,
  ADD CONSTRAINT transactions_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE public.reconciliation_sets ADD COLUMN IF NOT EXISTS organization_id uuid;
UPDATE public.reconciliation_sets s
SET organization_id = p.organization_id
FROM public.profiles p
WHERE p.id = s.user_id AND s.organization_id IS NULL;
ALTER TABLE public.reconciliation_sets ALTER COLUMN organization_id SET DEFAULT public.current_organization_id();
ALTER TABLE public.reconciliation_sets ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.reconciliation_sets
  DROP CONSTRAINT IF EXISTS reconciliation_sets_organization_id_fkey,
  ADD CONSTRAINT reconciliation_sets_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

ALTER TABLE public.reconciliation_entries ADD COLUMN IF NOT EXISTS organization_id uuid;
UPDATE public.reconciliation_entries e
SET organization_id = s.organization_id
FROM public.reconciliation_sets s
WHERE s.id = e.set_id AND e.organization_id IS NULL;
ALTER TABLE public.reconciliation_entries ALTER COLUMN organization_id SET DEFAULT public.current_organization_id();
ALTER TABLE public.reconciliation_entries ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.reconciliation_entries
  DROP CONSTRAINT IF EXISTS reconciliation_entries_organization_id_fkey,
  ADD CONSTRAINT reconciliation_entries_organization_id_fkey
    FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE RESTRICT;

DROP POLICY IF EXISTS "select_own_transactions" ON public.transactions;
DROP POLICY IF EXISTS "insert_own_transactions" ON public.transactions;
DROP POLICY IF EXISTS "update_own_transactions" ON public.transactions;
DROP POLICY IF EXISTS "delete_own_transactions" ON public.transactions;
DROP POLICY IF EXISTS "select_organization_transactions" ON public.transactions;
DROP POLICY IF EXISTS "insert_organization_transactions" ON public.transactions;
DROP POLICY IF EXISTS "update_organization_transactions" ON public.transactions;
DROP POLICY IF EXISTS "delete_organization_transactions" ON public.transactions;
CREATE POLICY "select_organization_transactions" ON public.transactions
  FOR SELECT TO authenticated USING (organization_id = public.current_organization_id());
CREATE POLICY "insert_organization_transactions" ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND organization_id = public.current_organization_id());
CREATE POLICY "update_organization_transactions" ON public.transactions
  FOR UPDATE TO authenticated
  USING (public.is_admin() AND organization_id = public.current_organization_id())
  WITH CHECK (public.is_admin() AND organization_id = public.current_organization_id());
CREATE POLICY "delete_organization_transactions" ON public.transactions
  FOR DELETE TO authenticated
  USING (public.is_admin() AND organization_id = public.current_organization_id());

DROP POLICY IF EXISTS "select_own_recsets" ON public.reconciliation_sets;
DROP POLICY IF EXISTS "insert_own_recsets" ON public.reconciliation_sets;
DROP POLICY IF EXISTS "update_own_recsets" ON public.reconciliation_sets;
DROP POLICY IF EXISTS "delete_own_recsets" ON public.reconciliation_sets;
DROP POLICY IF EXISTS "select_organization_recsets" ON public.reconciliation_sets;
DROP POLICY IF EXISTS "insert_organization_recsets" ON public.reconciliation_sets;
DROP POLICY IF EXISTS "update_organization_recsets" ON public.reconciliation_sets;
DROP POLICY IF EXISTS "delete_organization_recsets" ON public.reconciliation_sets;
CREATE POLICY "select_organization_recsets" ON public.reconciliation_sets
  FOR SELECT TO authenticated USING (organization_id = public.current_organization_id());
CREATE POLICY "insert_organization_recsets" ON public.reconciliation_sets
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND organization_id = public.current_organization_id());
CREATE POLICY "update_organization_recsets" ON public.reconciliation_sets
  FOR UPDATE TO authenticated
  USING (public.is_admin() AND organization_id = public.current_organization_id())
  WITH CHECK (public.is_admin() AND organization_id = public.current_organization_id());
CREATE POLICY "delete_organization_recsets" ON public.reconciliation_sets
  FOR DELETE TO authenticated
  USING (public.is_admin() AND organization_id = public.current_organization_id());

DROP POLICY IF EXISTS "select_own_recientries" ON public.reconciliation_entries;
DROP POLICY IF EXISTS "insert_own_recientries" ON public.reconciliation_entries;
DROP POLICY IF EXISTS "update_own_recientries" ON public.reconciliation_entries;
DROP POLICY IF EXISTS "delete_own_recientries" ON public.reconciliation_entries;
DROP POLICY IF EXISTS "select_organization_recientries" ON public.reconciliation_entries;
DROP POLICY IF EXISTS "insert_organization_recientries" ON public.reconciliation_entries;
DROP POLICY IF EXISTS "update_organization_recientries" ON public.reconciliation_entries;
DROP POLICY IF EXISTS "delete_organization_recientries" ON public.reconciliation_entries;
CREATE POLICY "select_organization_recientries" ON public.reconciliation_entries
  FOR SELECT TO authenticated USING (organization_id = public.current_organization_id());
CREATE POLICY "insert_organization_recientries" ON public.reconciliation_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() AND organization_id = public.current_organization_id()
    AND EXISTS (SELECT 1 FROM public.reconciliation_sets s
      WHERE s.id = set_id AND s.organization_id = public.current_organization_id())
  );
CREATE POLICY "update_organization_recientries" ON public.reconciliation_entries
  FOR UPDATE TO authenticated
  USING (public.is_admin() AND organization_id = public.current_organization_id())
  WITH CHECK (
    public.is_admin() AND organization_id = public.current_organization_id()
    AND EXISTS (SELECT 1 FROM public.reconciliation_sets s
      WHERE s.id = set_id AND s.organization_id = public.current_organization_id())
  );
CREATE POLICY "delete_organization_recientries" ON public.reconciliation_entries
  FOR DELETE TO authenticated
  USING (public.is_admin() AND organization_id = public.current_organization_id());

CREATE INDEX IF NOT EXISTS idx_profiles_organization ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_transactions_organization_date ON public.transactions(organization_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_sets_organization ON public.reconciliation_sets(organization_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_entries_organization ON public.reconciliation_entries(organization_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role text := COALESCE(NEW.raw_user_meta_data ->> 'role', '');
  organization_name text := NEW.raw_user_meta_data ->> 'organization_name';
  organization_uuid uuid;
BEGIN
  IF requested_role NOT IN ('admin', 'viewer') THEN
    RAISE EXCEPTION 'Choose Admin or Employee before creating your account.';
  END IF;
  IF organization_name IS NULL OR btrim(organization_name) = '' THEN
    RAISE EXCEPTION 'Organization name is required.';
  END IF;

  IF requested_role = 'admin' THEN
    INSERT INTO public.organizations (name)
    VALUES (organization_name)
    ON CONFLICT (name) DO NOTHING
    RETURNING id INTO organization_uuid;
    IF organization_uuid IS NULL THEN
      RAISE EXCEPTION 'An organization with this name already exists. Please choose a different name or contact your admin.';
    END IF;
  ELSE
    SELECT id INTO organization_uuid
    FROM public.organizations
    WHERE name = organization_name;
    IF organization_uuid IS NULL THEN
      RAISE EXCEPTION 'This organization does not exist. Please check the name or ask your admin to register first.';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, email, role, organization_id)
  VALUES (NEW.id, NEW.email, requested_role, organization_uuid)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;