-- Speed up organization-scoped transaction queries used by the dashboard.
CREATE INDEX IF NOT EXISTS idx_transactions_organization_date
  ON public.transactions(organization_id, date DESC);
