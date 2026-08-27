# AI Finance Controller

A full-stack finance dashboard for tracking transactions, identifying anomalies, reconciling records, collecting payments through Razorpay, and generating AI-powered financial insights with Google Gemini.

## Highlights

- Transaction dashboard with cash-flow and spending visualizations
- Transaction CRUD, CSV import/export, categorization, and anomaly detection
- Invoice and bank-statement reconciliation
- Multi-organization support with organization-scoped financial data
- Employee expense request and Admin approval workflow
- Razorpay INR payments, refunds, and optional webhook processing
- Gemini-powered answers about the signed-in user's financial data

## Technology

- React, Vite, Tailwind CSS, Recharts, and Lucide
- Supabase Auth, Postgres, Row Level Security, and Edge Functions
- Google Gemini API
- Razorpay API

All monetary amounts are handled in Indian Rupees (INR / ₹).

## Signup and access

Signup requires selecting a role: Admin or Employee. Both roles must enter an Organization Name.

- Admin signup creates a new organization with that name and fails if the name already exists.
- Employee signup joins an existing organization by name and fails if the organization does not exist.
- All users in the same organization share its transaction data.
- Admins have full write access. Employees have read-only access to shared data and can submit expense requests for approval.

## Employee Expense Requests

Employees can submit an expense request with an amount, category, vendor or payee, description, and date. Each request is stored as a negative, pending transaction and appears in the Admin's Review Queue with an `Employee Request` label.

Admins can Approve, Reject, or Escalate requests. Only approved or cleared transactions count toward dashboard totals; pending and rejected requests do not.

## How to Test

1. Sign up as Admin with an organization name (e.g., "TestCorp").
2. Sign up as Employee using the same organization name.
3. As Admin, test a Razorpay payment using this test card: Card number `5267 3181 8797 5449`, any future expiry date, CVV `123`.
4. As Employee, submit an expense request and confirm it appears in the Admin's Review Queue.
5. As Admin, approve or reject the request and confirm it reflects correctly on the dashboard.

## Run locally

```bash
git clone https://github.com/Ajay-Kote/AI-FinanceController.git
cd AI-FinanceController
npm install
cp .env.example .env
npm run dev
```

Set these browser-safe values in `.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Supabase setup

1. Create a Supabase project.
2. In the SQL Editor, run the migration files in `supabase/migrations/` in filename order.
3. Set server-side Edge Function secrets. Do not place these in the frontend or commit them to Git.

```bash
npx supabase login
npx supabase secrets set GEMINI_API_KEY=your_gemini_key --project-ref your-project-ref
npx supabase secrets set RAZORPAY_KEY_ID=rzp_test_your_key_id --project-ref your-project-ref
npx supabase secrets set RAZORPAY_KEY_SECRET=your_razorpay_secret --project-ref your-project-ref
```

4. Deploy the Edge Functions:

```bash
npx supabase functions deploy ai-insights --project-ref your-project-ref
npx supabase functions deploy auto-categorize --project-ref your-project-ref
npx supabase functions deploy razorpay-payment --project-ref your-project-ref
npx supabase functions deploy razorpay-refund --project-ref your-project-ref
npx supabase functions deploy razorpay-webhook --project-ref your-project-ref
```

For webhooks, configure Razorpay to send `payment.captured`, `payment.failed`, and `refund.processed` events to:

```text
https://your-project-ref.supabase.co/functions/v1/razorpay-webhook
```

## Security

- `.env` files are excluded from version control.
- API secrets belong in Supabase Edge Function secrets, never in client code.
- Row Level Security limits financial records to the signed-in user's organization; only Admins can modify shared financial data.
- Regenerate any key that has been exposed in a terminal, chat, commit, or screenshot.

## Scripts

```bash
npm run dev      # Start the development server
npm run build    # Create a production build
npm run preview  # Preview the production build
```
