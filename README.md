# FinControl AI

AI-powered finance controller with transaction management, anomaly detection, reconciliation, AI insights (Google Gemini), and Razorpay payment integration.

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-nskf89mr)

## Features

- **Dashboard** — financial overview with charts, net cash flow, anomaly alerts, and Razorpay payment analytics
- **Transactions** — full CRUD with CSV import/export, auto-categorization, and anomaly flagging
- **Payments** — dedicated page for Razorpay payments with refund management
- **Review Queue** — approve, reject, or escalate flagged transactions (admin only)
- **Reconciliation** — match invoices against bank statements
- **AI Insights** — ask natural-language questions about your finances, powered by Google Gemini
- **Razorpay Integration** — accept payments in INR, webhook support, and refund processing

## Tech Stack

- **Frontend:** React + Vite + Tailwind CSS + Recharts + Lucide icons
- **Backend:** Supabase (Postgres, Auth, Edge Functions, RLS)
- **AI:** Google Gemini API (via Supabase Edge Function)
- **Payments:** Razorpay (via Supabase Edge Functions)

## Currency

All amounts in the app are displayed in **Indian Rupees (INR / ₹)**. Razorpay processes payments in INR. The amount you enter in the "Make Payment" modal is sent directly to Razorpay in INR (converted to paise internally: rupees × 100).

## Local Setup

### 1. Clone the repo

```bash
git clone https://github.com/yourusername/fincontrol-ai.git
cd fincontrol-ai
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Open `.env` and set the two frontend variables:

| Variable | Where to get it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase Dashboard → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API → Project API keys → **anon public** |

### 4. Set up the database

If you haven't already, create a new Supabase project at [supabase.com](https://supabase.com).

The database schema is in `supabase/migrations/`. To apply it:

- **Option A (Supabase Dashboard):** Go to SQL Editor and paste the contents of the migration file, then run it.
- **Option B (Supabase CLI):**
  ```bash
  npx supabase db push
  ```

This creates the `profiles`, `transactions`, `reconciliation_sets`, and `reconciliation_entries` tables with Row Level Security policies. The first user to sign up is automatically assigned the `admin` role.

### 5. Set up Edge Function secrets

The edge functions need four server-side secrets. These are **not** read from `.env` — they must be set as Supabase Edge Function secrets:

```bash
# Google Gemini API key (for AI Insights)
# Get it from: https://aistudio.google.com/apikey
npx supabase secrets set GEMINI_API_KEY=your_gemini_api_key

# Razorpay test keys (for payments and refunds)
# Get them from: https://dashboard.razorpay.com/app/keys
# Use TEST mode keys (rzp_test_...) for development
npx supabase secrets set RAZORPAY_KEY_ID=rzp_test_your_key_id
npx supabase secrets set RAZORPAY_KEY_SECRET=your_key_secret

# Razorpay webhook secret (for webhook signature verification)
# Get it from: Razorpay Dashboard > Settings > Webhooks (after creating a webhook)
npx supabase secrets set RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
```

Alternatively, set these via the Supabase Dashboard → Edge Functions → Secrets.

### 6. Deploy Edge Functions

Deploy the four edge functions to your Supabase project:

```bash
npx supabase functions deploy ai-insights
npx supabase functions deploy auto-categorize
npx supabase functions deploy razorpay-payment
npx supabase functions deploy razorpay-refund
npx supabase functions deploy razorpay-webhook
```

Or deploy them via the Supabase Dashboard → Edge Functions → New Function.

### 7. Set up Razorpay Webhook

After deploying the `razorpay-webhook` edge function, configure the webhook URL in your Razorpay Dashboard:

1. Go to [Razorpay Dashboard → Settings → Webhooks](https://dashboard.razorpay.com/app/webhooks)
2. Click **Add New Webhook**
3. Set the Webhook URL to:
   ```
   https://<your-supabase-project>.supabase.co/functions/v1/razorpay-webhook
   ```
4. Select the following events:
   - `payment.captured`
   - `payment.failed`
   - `refund.processed`
5. Copy the **Secret** that Razorpay generates
6. Set it as a Supabase secret:
   ```bash
   npx supabase secrets set RAZORPAY_WEBHOOK_SECRET=the_secret_from_razorpay
   ```

The webhook function verifies the signature on every request using this secret, so only genuine Razorpay requests are processed.

### 8. Run the dev server

```bash
npm run dev
```

Open the URL shown in your terminal (typically `http://localhost:5173`).

### 9. Create your first account

Sign up with any email and password. The first registered user automatically becomes the admin. Subsequent users get the `viewer` role (read-only access).

## Refund Flow

1. Go to the **Payments** page (sidebar)
2. Find the payment you want to refund (must have status "captured")
3. Click the refund button (circular arrow icon)
4. A confirmation dialog shows the amount and payment ID
5. Click **Process Refund** — the Razorpay Refunds API is called
6. The transaction status updates to "refunded" in the database
7. If webhooks are configured, Razorpay will also send a `refund.processed` event

## Where to get each key

| Key | Source | Used by |
|---|---|---|
| Supabase URL | [Supabase Dashboard](https://supabase.com/dashboard) → Project Settings → API | Frontend + all edge functions |
| Supabase anon key | Same as above → Project API keys → anon public | Frontend + all edge functions |
| Gemini API key | [Google AI Studio](https://aistudio.google.com/apikey) | `ai-insights` edge function |
| Razorpay Key ID | [Razorpay Dashboard](https://dashboard.razorpay.com/app/keys) → Test mode | `razorpay-payment` + `razorpay-refund` edge functions |
| Razorpay Key Secret | Same as above | `razorpay-payment` + `razorpay-refund` edge functions |
| Razorpay Webhook Secret | [Razorpay Dashboard](https://dashboard.razorpay.com/app/webhooks) → after creating a webhook | `razorpay-webhook` edge function |

## Notes

- **Test Mode:** All payments use Razorpay's test mode. A "Test Mode" badge is shown near the Make Payment button and inside the payment modal. Use test card numbers from the [Razorpay docs](https://razorpay.com/docs/payments/payments/test-card-upi/) to complete test payments.
- **Currency:** All amounts are in INR (₹). No currency conversion is performed.
- **Email confirmation is off** by default — you can sign up and log in immediately without confirming your email.
- **RLS is enabled** on all tables. Users can only access their own data.
