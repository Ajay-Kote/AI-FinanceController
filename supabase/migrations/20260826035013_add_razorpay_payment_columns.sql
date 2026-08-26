/*
# Add Razorpay payment tracking columns to transactions

1. Modified Tables
- `transactions`: Added three new nullable columns to track Razorpay payments:
  - `razorpay_order_id` (text) — the Razorpay order ID created during checkout
  - `razorpay_payment_id` (text) — the Razorpay payment ID returned after successful payment
  - `razorpay_status` (text) — the payment status from Razorpay/webhook: 'captured', 'failed', 'refunded', or NULL for non-Razorpay transactions
  - `razorpay_refund_id` (text) — the Razorpay refund ID if a refund was processed
2. Security
- No RLS policy changes. Existing owner-scoped CRUD policies on `transactions` still apply.
3. Important Notes
- All new columns are nullable so existing transactions are unaffected.
- The `status` CHECK constraint is NOT modified — Razorpay-specific status lives in `razorpay_status`, separate from the workflow `status` column.
- An index on `razorpay_order_id` is added for webhook lookups by order ID.
*/

-- Add nullable columns (idempotent via DO block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'razorpay_order_id') THEN
    ALTER TABLE public.transactions ADD COLUMN razorpay_order_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'razorpay_payment_id') THEN
    ALTER TABLE public.transactions ADD COLUMN razorpay_payment_id text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'razorpay_status') THEN
    ALTER TABLE public.transactions ADD COLUMN razorpay_status text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'razorpay_refund_id') THEN
    ALTER TABLE public.transactions ADD COLUMN razorpay_refund_id text;
  END IF;
END $$;

-- Index for webhook lookups by order ID
CREATE INDEX IF NOT EXISTS idx_transactions_razorpay_order ON public.transactions(razorpay_order_id) WHERE razorpay_order_id IS NOT NULL;
