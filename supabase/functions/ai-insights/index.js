import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// =====================================================================
// AI INSIGHTS EDGE FUNCTION — Google Gemini integration
// =====================================================================
// Receives a natural-language question about the user's finances, builds a
// compact JSON summary of the user's transactions, sends it to the Google
// Gemini API, and returns the generated text.
//
// API key is read from the GEMINI_API_KEY environment variable (a Supabase
// secret). It is never hardcoded. To set your key after this is deployed:
//
//   npx supabase secrets set GEMINI_API_KEY=your_key_here
//
// (or set it via the Supabase dashboard under Edge Functions > Secrets)
//
// === HOW TO SWAP IN A DIFFERENT LLM PROVIDER ===
// Replace the callGemini() function below with a call to your provider's
// API. The only contract is: take a prompt string + transaction context,
// return a text answer. Everything else (auth, data fetching, response
// shape) stays the same.
// =====================================================================

// Build a compact JSON summary of the user's transactions to include in the
// prompt. We pass a structured summary (not the raw rows) to keep the prompt
// small and focused — this reduces token cost and improves answer quality.
function buildTransactionSummary(rows) {
  const income = rows.filter((r) => r.amount > 0).reduce((s, r) => s + r.amount, 0);
  const expense = rows.filter((r) => r.amount < 0).reduce((s, r) => s + Math.abs(r.amount), 0);

  // Monthly breakdown for trend analysis.
  const byMonth = new Map();
  for (const r of rows) {
    const m = r.date.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, { income: 0, expense: 0 });
    const entry = byMonth.get(m);
    if (r.amount > 0) entry.income += r.amount;
    else entry.expense += Math.abs(r.amount);
  }
  const monthly = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({ month, income: Number(v.income.toFixed(2)), expense: Number(v.expense.toFixed(2)) }));

  // Category breakdown for expense analysis.
  const byCat = new Map();
  for (const r of rows) {
    if (r.amount < 0) {
      const cat = r.category ?? 'Uncategorized';
      byCat.set(cat, (byCat.get(cat) ?? 0) + Math.abs(r.amount));
    }
  }
  const categories = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, total]) => ({ category, total: Number(total.toFixed(2)) }));

  // Top 20 recent transactions for specific-question context.
  const recent = rows.slice(0, 20).map((r) => ({
    date: r.date,
    amount: Number(r.amount.toFixed(2)),
    category: r.category ?? 'Uncategorized',
    description: r.description ?? '',
    vendor: r.vendor ?? '',
  }));

  // Anomaly summary
  const anomalies = rows.filter((r) => r.is_anomaly).slice(0, 5).map((r) => ({
    date: r.date,
    amount: Number(r.amount.toFixed(2)),
    category: r.category ?? 'Uncategorized',
    vendor: r.vendor ?? '',
    reason: r.anomaly_reason ?? 'Unknown',
  }));

  return {
    totals: {
      income: Number(income.toFixed(2)),
      expense: Number(expense.toFixed(2)),
      net: Number((income - expense).toFixed(2)),
      transaction_count: rows.length,
    },
    monthly,
    categories,
    recent_transactions: recent,
    flagged_anomalies: anomalies,
  };
}

// Build the full prompt sent to Gemini. Combines a system-level instruction
// with the user's question and the transaction data summary.
function buildPrompt(question, summary) {
  return [
    'You are FinControl AI, a financial insights assistant for a finance controller application.',
    'You analyze transaction data and answer the user\'s question clearly and concisely.',
    '',
    'Instructions:',
    '- Use ONLY the actual numbers from the data provided below to support your answer.',
    '- If the data does not contain enough information to answer, say so honestly.',
    '- Format monetary values as USD (e.g., $12,345.67).',
    '- Keep responses focused and under 300 words unless the question requires more detail.',
    '- When discussing trends, reference specific months and categories from the data.',
    '- If there are flagged anomalies, mention them when relevant.',
    '- Payments made via Razorpay appear as transactions with vendor "Razorpay" and status "cleared".',
    '',
    'Transaction data (JSON summary):',
    JSON.stringify(summary, null, 2),
    '',
    `User question: ${question}`,
  ].join('\n');
}

// =====================================================================
// GEMINI API CALL
// =====================================================================
// This is the only function that talks to Google Gemini. To switch to a
// different LLM provider (OpenAI, Anthropic Claude, etc.), replace the body
// of this function with a call to your provider's API. The expected input
// is a prompt string; the expected output is the generated text string.
//
// Gemini API docs:
//   https://ai.google.dev/gemini-api/docs/text-generation
//
// To check available model names:
//   https://ai.google.dev/gemini-api/docs/models
//
// If you get a "model not found" error, update the model name below to a
// currently available model (e.g., gemini-2.0-flash, gemini-1.5-flash, etc.)
// =====================================================================
async function callGemini(prompt) {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY secret is not configured. Set it via: npx supabase secrets set GEMINI_API_KEY=your_key');
  }

  // --- UPDATE THIS MODEL NAME if you get a "model not found" error ---
  // Check https://ai.google.dev/gemini-api/docs/models for the latest list.
  const model = 'gemini-3.6-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Standard Gemini generateContent request body: contents -> parts -> text.
  const requestBody = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 1024,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  // Extract generated text from data.candidates[0].content.parts[0].text.
  const candidates = data?.candidates;
  if (!candidates || candidates.length === 0) {
    throw new Error('Gemini returned no candidates in the response.');
  }

  const parts = candidates[0]?.content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error('Gemini returned no content parts in the response.');
  }

  const text = parts[0]?.text;
  if (!text) {
    throw new Error('Gemini returned an empty text response.');
  }

  return text;
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
    const { question } = body;

    if (!question?.trim()) {
      return new Response(JSON.stringify({ error: 'Question is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the current user's transactions for context (scoped to their own
    // rows by RLS). Limited to 500 most recent to keep the prompt small.
    const { data: txData, error: txError } = await supabase
      .from('transactions')
      .select('date, amount, category, description, vendor, is_anomaly, anomaly_reason, status')
      .order('date', { ascending: false })
      .limit(500);

    if (txError) throw new Error(txError.message);

    const rows = txData ?? [];

    // Build a compact JSON summary and the full prompt.
    const summary = buildTransactionSummary(rows);
    const prompt = buildPrompt(question, summary);

    // --- GEMINI API CALL ---
    // If the key is missing or the API call fails, we return a clear fallback
    // message instead of crashing, so the frontend always gets a usable answer.
    let answer;
    try {
      answer = await callGemini(prompt);
    } catch (geminiErr) {
      const msg = geminiErr instanceof Error ? geminiErr.message : String(geminiErr);
      answer = `I couldn't connect to the AI insights service right now. ${msg}\n\nPlease verify that the GEMINI_API_KEY secret is configured and valid. You can set it with:\n  npx supabase secrets set GEMINI_API_KEY=your_key`;
    }

    // Same response shape the frontend expects: { answer, source }.
    return new Response(JSON.stringify({ answer, source: 'gemini' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
