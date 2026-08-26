# FinControl AI

AI-powered finance controller with transaction management, anomaly detection, reconciliation, AI insights (Google Gemini), and Razorpay payment integration.

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-nskf89mr)

## Features

- **Dashboard** — financial overview with charts, net cash flow, and anomaly alerts
- **Transactions** — full CRUD with CSV import/export, auto-categorization, and anomaly flagging
- **Review Queue** — approve, reject, or escalate flagged transactions (admin only)
- **Reconciliation** — match invoices against bank statements
- **AI Insights** — ask natural-language questions about your finances, powered by Google Gemini
- **Payments** — accept payments via Razorpay Checkout (test mode)

## Tech Stack

- **Frontend:** React + Vite + Tailwind CSS + Recharts + Lucide icons
- **Backend:** Supabase (Postgres, Auth, Edge Functions, RLS)
- **AI:** Google Gemini API (via Supabase Edge Function)
- **Payments:** Razorpay (via Supabase Edge Function)

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

The edge functions need three server-side secrets. These are **not** read from `.env` — they must be set as Supabase Edge Function secrets:

```bash
# Google Gemini API key (for AI Insights)
# Get it from: https://aistudio.google.com/apikey
npx supabase secrets set GEMINI_API_KEY=your_gemini_api_key

# Razorpay test keys (for payments)
# Get them from: https://dashboard.razorpay.com/app/keys
# Use TEST mode keys (rzp_test_...) for development
npx supabase secrets set RAZORPAY_KEY_ID=rzp_test_your_key_id
npx supabase secrets set RAZORPAY_KEY_SECRET=your_key_secret
```

Alternatively, set these via the Supabase Dashboard → Edge Functions → Secrets.

### 6. Deploy Edge Functions

Deploy the three edge functions to your Supabase project:

```bash
npx supabase functions deploy ai-insights
npx supabase functions deploy auto-categorize
npx supabase functions deploy razorpay-payment
```

Or deploy them via the Supabase Dashboard → Edge Functions → New Function.

### 7. Run the dev server

```bash
npm run dev
```

Open the URL shown in your terminal (typically `http://localhost:5173`).

### 8. Create your first account

Sign up with any email and password. The first registered user automatically becomes the admin. Subsequent users get the `viewer` role (read-only access).

## Where to get each key

| Key | Source | Used by |
|---|---|---|
| Supabase URL | [Supabase Dashboard](https://supabase.com/dashboard) → Project Settings → API | Frontend + all edge functions |
| Supabase anon key | Same as above → Project API keys → anon public | Frontend + all edge functions |
| Gemini API key | [Google AI Studio](https://aistudio.google.com/apikey) | `ai-insights` edge function |
| Razorpay Key ID | [Razorpay Dashboard](https://dashboard.razorpay.com/app/keys) → Test mode | `razorpay-payment` edge function |
| Razorpay Key Secret | Same as above | `razorpay-payment` edge function |

## Notes

- **Razorpay test mode:** Payments use Razorpay's test mode, which only supports INR. Amounts entered in USD are converted at a fixed rate (83 INR = 1 USD) for the test payment. Use test card numbers from the [Razorpay docs](https://razorpay.com/docs/payments/payments/test-card-upi/) to complete test payments.
- **Email confirmation is off** by default — you can sign up and log in immediately without confirming your email.
- **RLS is enabled** on all tables. Users can only access their own data.
