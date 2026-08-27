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
// Handles two actions:
//
// 1. create_order — Creates a Razorpay order. Amount is in INR (paise).
//    Returns order_id, amount_paise, and key_id to the frontend.
//
// 2. verify_payment — Verifies the Razorpay payment signature, then
//    creates a transaction in the database with Razorpay IDs stored.
//
// === ENVIRONMENT VARIABLES (SECRETS) ===
// RAZORPAY_KEY_ID     — Your Razorpay key ID (starts with rzp_test_ or rzp_live_)
// RAZORPAY_KEY_SECRET — Your Razorpay key secret
//
// Set via:
//   npx supabase secrets set RAZORPAY_KEY_ID=rzp_test_your_key_id
//   npx supabase secrets set RAZORPAY_KEY_SECRET=your_key_secret
//
// Get your keys from: https://dashboard.razorpay.com/app/keys
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

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', userData.user.id)
      .single();
    if (profileError || !profile?.organization_id) {
      throw new Error('Your account is not linked to an organization.');
    }

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
    // Amount is received in INR (rupees) from the frontend. We convert
    // to paise (amount * 100) for the Razorpay API.
    if (action === 'create_order') {
      const { amount, description } = body;

      if (!amount || amount <= 0) {
        return new Response(JSON.stringify({ error: 'Amount must be greater than 0' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const amountInPaise = Math.round(amount * 100);

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
            organization_id: profile.organization_id,
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
        amount_inr: amount,
        key_id: razorpayKeyId,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // -----------------------------------------------------------------
    // ACTION 2: VERIFY PAYMENT
    // -----------------------------------------------------------------
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

      const expectedSignature = createHmac('sha256', razorpayKeySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (expectedSignature !== razorpay_signature) {
        return new Response(JSON.stringify({ error: 'Payment signature verification failed' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const today = new Date().toISOString().slice(0, 10);
      const { data: txData, error: txError } = await supabase
        .from('transactions')
        .insert({
          organization_id: profile.organization_id,
          date: today,
          amount: amount,
          category: 'Revenue',
          description: description || 'Payment received via Razorpay',
          vendor: 'Razorpay',
          payment_method: 'credit_card',
          status: 'cleared',
          razorpay_order_id: razorpay_order_id,
          razorpay_payment_id: razorpay_payment_id,
          razorpay_status: 'captured',
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
