import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { createHmac } from 'node:crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// =====================================================================
// RAZORPAY PAYMENT EDGE FUNCTION
// =====================================================================
// This function handles two actions:
//
// 1. create_order — Creates a Razorpay order using the Razorpay REST API.
//    Returns the order_id and amount in paise to the frontend.
//
// 2. verify_payment — Verifies the Razorpay payment signature for security,
//    then creates a transaction in the database marked as "paid via Razorpay".
//
// === ENVIRONMENT VARIABLES (SECRETS) ===
// RAZORPAY_KEY_ID     — Your Razorpay test key ID (starts with rzp_test_)
// RAZORPAY_KEY_SECRET — Your Razorpay test key secret
//
// === HOW TO SET YOUR RAZORPAY TEST KEYS ===
// Add them as Supabase Edge Function secrets:
//
//   npx supabase secrets set RAZORPAY_KEY_ID=rzp_test_your_key_id
//   npx supabase secrets set RAZORPAY_KEY_SECRET=your_key_secret
//
// Or set them via the Supabase dashboard under Edge Functions > Secrets.
//
// Get your test keys from: https://dashboard.razorpay.com/app/keys
// =====================================================================

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

    // Read Razorpay keys from environment variables (secrets).
    // NOTE: These are the SECRET keys — they must never be exposed to the frontend.
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID');
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');

    if (!razorpayKeyId || !razorpayKeySecret) {
      return new Response(JSON.stringify({
        error: 'Razorpay keys not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET as Supabase secrets.',
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action } = body;

    // -----------------------------------------------------------------
    // ACTION 1: CREATE ORDER
    // -----------------------------------------------------------------
    // Calls the Razorpay API to create an order. The order_id returned
    // is passed to the Razorpay Checkout on the frontend.
    if (action === 'create_order') {
      const { amount, description } = body;

      if (!amount || amount <= 0) {
        return new Response(JSON.stringify({ error: 'Amount must be greater than 0' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Convert USD amount to INR for Razorpay test mode.
      // Razorpay test mode only supports INR. We use a fixed conversion rate.
      // In production, you would use a real exchange rate or charge in INR directly.
      const USD_TO_INR_RATE = 83; // approximate rate
      const amountInr = Math.round(amount * USD_TO_INR_RATE);
      const amountInPaise = amountInr * 100; // Razorpay expects amount in paise (1 INR = 100 paise)

      // Call Razorpay API to create an order.
      // Docs: https://razorpay.com/docs/api/orders/
      const orderResp = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Basic ' + btoa(`${razorpayKeyId}:${razorpayKeySecret}`),
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency: 'INR',
          receipt: `fincontrol_${Date.now()}`,
          notes: {
            description: description || 'Payment via FinControl AI',
            user_id: userData.user.id,
          },
        }),
      });

      if (!orderResp.ok) {
        const errText = await orderResp.text();
        return new Response(JSON.stringify({ error: `Razorpay order creation failed: ${errText}` }), {
          status: orderResp.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const orderData = await orderResp.json();

      return new Response(JSON.stringify({
        order_id: orderData.id,
        amount_paise: amountInPaise,
        key_id: razorpayKeyId,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // -----------------------------------------------------------------
    // ACTION 2: VERIFY PAYMENT
    // -----------------------------------------------------------------
    // Verifies the payment signature sent by Razorpay Checkout.
    // This is CRITICAL for security — it proves the payment actually happened
    // and was not tampered with.
    //
    // Signature verification: HMAC-SHA256 of (order_id + '|' + payment_id)
    // using the key secret, compared to the signature from Razorpay.
    if (action === 'verify_payment') {
      const {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        amount,
        description,
      } = body;

      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return new Response(JSON.stringify({ error: 'Missing payment details for verification' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify the signature: HMAC-SHA256 of "order_id|payment_id" with the secret.
      const expectedSignature = createHmac('sha256', razorpayKeySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (expectedSignature !== razorpay_signature) {
        return new Response(JSON.stringify({ error: 'Payment signature verification failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Signature is valid — create a transaction in the database.
      // The transaction is marked as "cleared" (payment confirmed) and the
      // payment_method is set to "credit_card" (Razorpay processes card/UPI/etc).
      // The description includes "Paid via Razorpay" so it's identifiable.
      const today = new Date().toISOString().slice(0, 10);
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .insert({
          date: today,
          amount: amount, // positive = income (payment received)
          category: 'Revenue',
          description: description || 'Payment received via Razorpay',
          vendor: 'Razorpay',
          payment_method: 'credit_card',
          status: 'cleared',
        })
        .select()
        .single();

      if (txError) {
        return new Response(JSON.stringify({ error: `Failed to create transaction: ${txError.message}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        verified: true,
        transaction: txData,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action. Use "create_order" or "verify_payment".' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
