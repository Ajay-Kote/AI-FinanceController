-- Employee expense requests are pending, self-authored transactions.

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS requested_by_email text;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS requested_by_employee boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "insert_employee_expense_requests" ON public.transactions;
CREATE POLICY "insert_employee_expense_requests" ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.is_admin() = false
    AND requested_by_employee = true
    AND requested_by = auth.uid()
    AND requested_by_email = (SELECT email FROM public.profiles WHERE id = auth.uid())
    AND status = 'pending'
    AND amount < 0
  );

CREATE INDEX IF NOT EXISTS idx_transactions_requested_by
  ON public.transactions(requested_by) WHERE requested_by_employee = true;