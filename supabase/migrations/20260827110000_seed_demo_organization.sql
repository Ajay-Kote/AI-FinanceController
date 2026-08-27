-- Seed the reserved demo organization once, at the first successful signup or join.

CREATE OR REPLACE FUNCTION public.demo_organization_name()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'DemoCorp'::text;
$$;

CREATE OR REPLACE FUNCTION public.seed_demo_organization(
  p_organization_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = p_organization_id AND name = public.demo_organization_name()
  ) THEN
    RETURN;
  END IF;

  -- Serialize first-join checks so concurrent signups cannot duplicate rows.
  PERFORM pg_advisory_xact_lock(hashtext('fincontrol-demo-seed'));

  IF EXISTS (
    SELECT 1 FROM public.transactions
    WHERE organization_id = p_organization_id
  ) THEN
    RETURN;
  END IF;

  WITH demo_templates(vendor, category, description, amount, payment_method, is_anomaly, anomaly_reason) AS (
    VALUES
      ('Razorpay', 'Revenue', 'Client payment - Northwind', 85000::numeric, 'bank_transfer', false, NULL::text),
      ('Razorpay', 'Revenue', 'Client payment - Globex', 120000::numeric, 'bank_transfer', false, NULL::text),
      ('Razorpay', 'Revenue', 'Client payment - Initech', 62000::numeric, 'bank_transfer', false, NULL::text),
      ('Gusto', 'Payroll', 'Payroll run - biweekly', -98000::numeric, 'bank_transfer', false, NULL::text),
      ('AWS', 'Software', 'Cloud infrastructure subscription', -14500::numeric, 'credit_card', false, NULL::text),
      ('GitHub', 'Software', 'Organization subscription', -960::numeric, 'credit_card', false, NULL::text),
      ('Google Ads', 'Marketing', 'Quarterly advertising campaign', -32000::numeric, 'credit_card', false, NULL::text),
      ('Uber', 'Travel', 'Client meeting travel', -450::numeric, 'credit_card', false, NULL::text),
      ('Marriott', 'Travel', 'Conference hotel', -8900::numeric, 'credit_card', false, NULL::text),
      ('Equity Office', 'Rent', 'Monthly office rent', -45000::numeric, 'bank_transfer', false, NULL::text),
      ('McKinsey', 'Consulting', 'Emergency consulting engagement', -185000::numeric, 'bank_transfer', true, 'Unusually large consulting expense'),
      ('Unknown Vendor', 'Other', 'Unrecognized card purchase', -27500::numeric, 'credit_card', true, 'Vendor and amount need verification')
  )
  INSERT INTO public.transactions (
    user_id, organization_id, date, amount, category, description, vendor,
    payment_method, status, is_anomaly, anomaly_reason, anomaly_confidence
  )
  SELECT
    p_user_id,
    p_organization_id,
    current_date - ((item_number * 45) + (abs(hashtext(template.vendor)) % 20)),
    template.amount,
    template.category,
    template.description || CASE WHEN item_number = 0 THEN '' ELSE ' - period ' || item_number::text END,
    template.vendor,
    template.payment_method,
    CASE WHEN template.is_anomaly AND item_number = 0 THEN 'pending' ELSE 'cleared' END,
    template.is_anomaly AND item_number = 0,
    CASE WHEN template.is_anomaly AND item_number = 0 THEN template.anomaly_reason ELSE NULL END,
    CASE WHEN template.is_anomaly AND item_number = 0 THEN 92 ELSE NULL END
  FROM demo_templates AS template
  CROSS JOIN generate_series(0, 4) AS periods(item_number);
END;
$$;

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

  PERFORM public.seed_demo_organization(organization_uuid, NEW.id);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_demo_organization(uuid, uuid) FROM PUBLIC;

-- Recover an already-created empty DemoCorp without affecting other organizations.
DO $$
DECLARE
  demo_organization_id uuid;
  seed_user_id uuid;
BEGIN
  SELECT id INTO demo_organization_id
  FROM public.organizations
  WHERE name = public.demo_organization_name();

  IF demo_organization_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.transactions
      WHERE organization_id = demo_organization_id
    )
  THEN
    SELECT id INTO seed_user_id
    FROM public.profiles
    WHERE organization_id = demo_organization_id
    ORDER BY created_at
    LIMIT 1;

    IF seed_user_id IS NOT NULL THEN
      PERFORM public.seed_demo_organization(demo_organization_id, seed_user_id);
    END IF;
  END IF;
END;
$$;