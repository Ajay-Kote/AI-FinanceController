import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// =====================================================================
// RAZORPAY REFUND EDGE FUNCTION
// =====================================================================
// Processes a full or partial refund for a Razorpay payment.
//
// Calls the Razorpay Refunds API:
//   POST https://api.razorpay.com/v1/payments/{payment_id}/refund
//
// After a successful refund, updates the transaction's razorpay_status
// to "refunded" and stores the refund ID.
//
// === ENVIRONMENT VARIABLES (SECRETS) ===
// RAZORPAY_KEY_ID     — Your Razorpay key ID
// RAZORPAY_KEY_SECRET — Your Razorpay key secret
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

    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID');
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET');

    if (!razorpayKeyId || !razorpayKeySecret) {
      return new Response(JSON.stringify({
        error: 'Razorpay keys not configured.',
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { transaction_id, payment_id, amount } = await req.json();

    if (!payment_id) {
      return new Response(JSON.stringify({ error: 'Missing Razorpay payment ID' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call Razorpay Refunds API
    const refundBody = {};
    if (amount && amount > 0) {
      refundBody.amount = Math.round(amount * 100); // rupees to paise for partial refund
    }
    // If no amount specified, Razorpay processes a full refund

    const refundResp = await fetch(`https://api.razorpay.com/v1/payments/${payment_id}/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + btoa(`${razorpayKeyId}:${razorpayKeySecret}`),
      },
      body: JSON.stringify(refundBody),
    });

    if (!refundResp.ok) {
      const errText = await refundResp.text();
      return new Response(JSON.stringify({ error: `Razorpay refund failed: ${errText}` }), {
        status: refundResp.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const refundData = await refundResp.json();

    // Update the transaction in the database
    if (transaction_id) {
      await supabase
        .from('transactions')
        .update({
          razorpay_status: 'refunded',
          razorpay_refund_id: refundData.id,
          status: 'rejected',
        })
        .eq('id', transaction_id);
    }

    return new Response(JSON.stringify({
      success: true,
      refund_id: refundData.id,
      refund_status: refundData.status,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
