import { supabase } from './supabase';
import { suggestCategory } from './categorize';

// Generates 60+ sample transactions across the last 8 months so the dashboard
// looks populated on first load. Called once when the admin has zero transactions.
// All amounts are in INR (rupees).
const VENDORS = [
  { vendor: 'Razorpay', desc: 'Client payment - Acme Corp', amount: 85000, method: 'bank_transfer' },
  { vendor: 'Razorpay', desc: 'Client payment - Globex', amount: 120000, method: 'bank_transfer' },
  { vendor: 'Razorpay', desc: 'Client payment - Initech', amount: 62000, method: 'bank_transfer' },
  { vendor: 'Gusto', desc: 'Payroll run - biweekly', amount: -98000, method: 'bank_transfer' },
  { vendor: 'Gusto', desc: 'Payroll run - biweekly', amount: -98000, method: 'bank_transfer' },
  { vendor: 'AWS', desc: 'Cloud infrastructure monthly', amount: -14500, method: 'credit_card' },
  { vendor: 'GitHub', desc: 'Organization subscription', amount: -960, method: 'credit_card' },
  { vendor: 'Vercel', desc: 'Pro plan hosting', amount: -2000, method: 'credit_card' },
  { vendor: 'Figma', desc: 'Design team seats', amount: -2400, method: 'credit_card' },
  { vendor: 'Notion', desc: 'Workspace subscription', amount: -760, method: 'credit_card' },
  { vendor: 'Slack', desc: 'Business plan', amount: -720, method: 'credit_card' },
  { vendor: 'OpenAI', desc: 'API usage', amount: -3100, method: 'credit_card' },
  { vendor: 'Google Ads', desc: 'Q1 advertising campaign', amount: -32000, method: 'credit_card' },
  { vendor: 'Mailchimp', desc: 'Email marketing', amount: -990, method: 'credit_card' },
  { vendor: 'HubSpot', desc: 'CRM subscription', amount: -8000, method: 'credit_card' },
  { vendor: 'Uber', desc: 'Client meeting travel', amount: -450, method: 'credit_card' },
  { vendor: 'Marriott', desc: 'Conference hotel', amount: -8900, method: 'credit_card' },
  { vendor: 'DoorDash', desc: 'Team lunch', amount: -1280, method: 'credit_card' },
  { vendor: 'Starbucks', desc: 'Coffee meeting', amount: -180, method: 'credit_card' },
  { vendor: 'Comcast', desc: 'Office internet', amount: -1990, method: 'bank_transfer' },
  { vendor: 'PG&E', desc: 'Electricity bill', amount: -3400, method: 'bank_transfer' },
  { vendor: 'Equity Office', desc: 'Monthly office rent', amount: -45000, method: 'bank_transfer' },
  { vendor: 'Staples', desc: 'Office supplies', amount: -1560, method: 'credit_card' },
  { vendor: 'Apple', desc: 'New MacBook Pro', amount: -24990, method: 'credit_card' },
  { vendor: 'Dell', desc: 'Monitor for new hire', amount: -4300, method: 'credit_card' },
  { vendor: 'IRS', desc: 'Quarterly tax payment', amount: -52000, method: 'bank_transfer' },
  { vendor: 'Aetna', desc: 'Health insurance premium', amount: -12000, method: 'bank_transfer' },
  { vendor: 'LegalEase', desc: 'Contract review services', amount: -7500, method: 'bank_transfer' },
  { vendor: 'Razorpay', desc: 'Refund processed', amount: -5000, method: 'bank_transfer' },
  { vendor: 'Best Buy', desc: 'Office keyboard and mouse', amount: -890, method: 'credit_card' },
];

function randomDate(monthsBack) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - monthsBack, Math.floor(Math.random() * 28) + 1);
  return d.toISOString().slice(0, 10);
}

export async function seedSampleData(userId) {
  const rows = [];
  for (let m = 0; m < 8; m++) {
    const count = 7 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      const tmpl = VENDORS[Math.floor(Math.random() * VENDORS.length)];
      rows.push({
        date: randomDate(m),
        amount: tmpl.amount,
        category: suggestCategory(tmpl.desc, tmpl.vendor),
        description: tmpl.desc,
        vendor: tmpl.vendor,
        payment_method: tmpl.method,
      });
    }
  }
  rows.push({
    date: randomDate(1),
    amount: -185000,
    category: 'Consulting',
    description: 'Emergency consulting engagement',
    vendor: 'McKinsey',
    payment_method: 'bank_transfer',
  });

  const { error } = await supabase.from('transactions').insert(
    rows.map((r) => ({
      date: r.date,
      amount: r.amount,
      category: r.category,
      description: r.description,
      vendor: r.vendor,
      payment_method: r.payment_method,
      status: 'pending',
    }))
  );
  if (error) throw error;
}
