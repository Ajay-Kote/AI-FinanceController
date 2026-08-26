import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// =====================================================================
// AUTO-CATEGORIZATION EDGE FUNCTION
// =====================================================================
// This function suggests a category for a transaction based on its
// description and vendor text.
//
// CURRENT IMPLEMENTATION: rule-based keyword matching (see classify()).
//
// === HOW TO PLUG IN YOUR TRAINED ML MODEL ===
// Replace the body of classify() with a call to your model. Options:
//   1. Host the model behind an HTTP API and fetch() it here.
//   2. Use a Deno-compatible ONNX runtime to run inference in-function.
//   3. Query a vector embeddings table in Supabase for nearest-neighbor.
// The function receives { description, vendor } and must return a category
// string (or null if no confident prediction). Keep the response shape.
// =====================================================================

const RULES = [
  { category: 'Payroll', keywords: ['payroll', 'salary', 'wages', 'gusto', 'adp'] },
  { category: 'Software', keywords: ['aws', 'github', 'vercel', 'sentry', 'figma', 'notion', 'slack', 'openai', 'claude'] },
  { category: 'Office Supplies', keywords: ['staples', 'office depot', 'paper', 'stationery'] },
  { category: 'Marketing', keywords: ['facebook', 'google ads', 'mailchimp', 'hubspot', 'linkedin ads'] },
  { category: 'Travel', keywords: ['uber', 'lyft', 'airline', 'hotel', 'flight', 'marriott', 'airbnb'] },
  { category: 'Meals', keywords: ['restaurant', 'doordash', 'starbucks', 'catering'] },
  { category: 'Utilities', keywords: ['electric', 'water', 'gas company', 'comcast', 'verizon', 'internet'] },
  { category: 'Rent', keywords: ['rent', 'lease', 'landlord'] },
  { category: 'Consulting', keywords: ['consulting', 'contractor', 'freelance', 'agency', 'legal'] },
  { category: 'Hardware', keywords: ['apple', 'dell', 'best buy', 'laptop', 'monitor', 'server'] },
  { category: 'Taxes', keywords: ['irs', 'tax', 'sales tax'] },
  { category: 'Insurance', keywords: ['insurance', 'allstate', 'geico', 'aetna'] },
  { category: 'Refund', keywords: ['refund', 'reversal', 'chargeback'] },
  { category: 'Revenue', keywords: ['stripe', 'paypal', 'invoice paid', 'payment received', 'client payment', 'razorpay'] },
];

// --- REPLACE THIS FUNCTION WITH YOUR ML MODEL INFERENCE ---
function classify(description, vendor) {
  const text = `${description ?? ''} ${vendor ?? ''}`.toLowerCase();
  if (!text.trim()) return null;
  for (const rule of RULES) {
    if (rule.keywords.some((kw) => text.includes(kw))) return rule.category;
  }
  return 'Other';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY'),
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { description, vendor, transaction_id } = body;

    const category = classify(description ?? null, vendor ?? null);

    // If a transaction_id was provided, persist the suggested category.
    if (transaction_id && category) {
      await supabase.from('transactions').update({ category }).eq('id', transaction_id);
    }

    return new Response(JSON.stringify({ category, source: 'rule-based' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
