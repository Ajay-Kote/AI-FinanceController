import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { createHmac } from 'node:crypto';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// =====================================================================
// RAZORPAY WEBHOOK EDGE FUNCTION
// =====================================================================
// Listens for Razorpay webhook events and updates the database.
//
// Supported events:
//   payment.captured  — Payment succeeded; update transaction to "captured"
//   payment.failed    — Payment failed; create/update transaction with "failed"
//   refund.processed  — Refund completed; update transaction to "refunded"
//
// === WEBHOOK SIGNATURE VERIFICATION ===
// Every request from Razorpay includes a X-Razorpay-Signature header
// containing an HMAC-SHA256 of the raw request body, keyed with your
// webhook secret. We verify this to ensure the request is genuine.
//
// === HOW TO SET UP THE WEBHOOK ===
// 1. Deploy this edge function (it will be available at):
//      https://<your-project>.supabase.co/functions/v1/razorpay-webhook
// 2. Go to Razorpay Dashboard > Settings > Webhooks
//    (https://dashboard.razorpay.com/app/webhooks)
// 3. Click "Add New Webhook"
// 4. Set the Webhook URL to the edge function URL above
// 5. Select the events: payment.captured, payment.failed, refund.processed
// 6. Copy the "Secret" shown — you'll need it for the next step
// 7. Set the webhook secret as a Supabase edge function secret:
//      npx supabase secrets set RAZORPAY_WEBHOOK_SECRET=your_webhook_secret
//
// === ENVIRONMENT VARIABLES (SECRETS) ===
// RAZORPAY_WEBHOOK_SECRET — The webhook secret from Razorpay Dashboard
// SUPABASE_URL           — Auto-provisioned by Supabase
// SUPABASE_SERVICE_ROLE_KEY — Auto-provisioned (needed to write to DB
//                             without RLS, since webhooks have no user auth)
// =====================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
    if (!webhookSecret) {
      return new Response(JSON.stringify({ error: 'Webhook secret not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const rawBody = await req.text();
    const signature = req.headers.get('X-Razorpay-Signature');

    if (!signature) {
      return new Response(JSON.stringify({ error: 'Missing signature header' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify the webhook signature
    const expectedSignature = createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (expectedSignature !== signature) {
      return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const event = JSON.parse(rawBody);
    const eventType = event.event;
    const payload = event.payload?.payment?.entity || event.payload?.refund?.entity;

    if (!payload) {
      return new Response(JSON.stringify({ error: 'Unrecognized webhook payload' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use service role key to bypass RLS (webhooks have no user session)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    );

    async function resolveOrganizationId(orderId) {
      const fromPayload = payload.notes?.organization_id;
      if (fromPayload) return fromPayload;
      const keyId = Deno.env.get('RAZORPAY_KEY_ID');
      const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
      if (!keyId || !keySecret || !orderId) return null;
      const orderResponse = await fetch(`https://api.razorpay.com/v1/orders/${orderId}`, {
        headers: { Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}` },
      });
      if (!orderResponse.ok) return null;
      const order = await orderResponse.json();
      return order.notes?.organization_id ?? null;
    }

    // -----------------------------------------------------------------
    // payment.captured
    // -----------------------------------------------------------------
    if (eventType === 'payment.captured') {
      const orderId = payload.order_id;
      const paymentId = payload.id;
      const amount = payload.amount / 100; // paise to rupees

      // Try to find an existing transaction by order_id
      const { data: existing } = await supabase
        .from('transactions')
        .select('*')
        .eq('razorpay_order_id', orderId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('transactions')
          .update({
            razorpay_payment_id: paymentId,
            razorpay_status: 'captured',
            status: 'cleared',
          })
          .eq('id', existing.id);
      } else {
        // Webhook arrived before the frontend verified — create the transaction
        const organizationId = await resolveOrganizationId(orderId);
        if (!organizationId) throw new Error('Unable to determine the payment organization.');
        await supabase.from('transactions').insert({
          organization_id: organizationId,
          date: new Date().toISOString().slice(0, 10),
          amount: amount,
          category: 'Revenue',
          description: 'Payment received via Razorpay',
          vendor: 'Razorpay',
          payment_method: 'credit_card',
          status: 'cleared',
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_status: 'captured',
        });
      }
    }

    // -----------------------------------------------------------------
    // payment.failed
    // -----------------------------------------------------------------
    if (eventType === 'payment.failed') {
      const orderId = payload.order_id;
      const paymentId = payload.id;
      const failureReason = payload.error_description || payload.error_reason || 'Payment failed';

      const { data: existing } = await supabase
        .from('transactions')
        .select('*')
        .eq('razorpay_order_id', orderId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('transactions')
          .update({
            razorpay_payment_id: paymentId,
            razorpay_status: 'failed',
            status: 'rejected',
            anomaly_reason: failureReason,
          })
          .eq('id', existing.id);
      } else {
        const organizationId = await resolveOrganizationId(orderId);
        if (!organizationId) throw new Error('Unable to determine the payment organization.');
        await supabase.from('transactions').insert({
          organization_id: organizationId,
          date: new Date().toISOString().slice(0, 10),
          amount: payload.amount / 100,
          category: 'Revenue',
          description: `Failed payment: ${failureReason}`,
          vendor: 'Razorpay',
          payment_method: 'credit_card',
          status: 'rejected',
          razorpay_order_id: orderId,
          razorpay_payment_id: paymentId,
          razorpay_status: 'failed',
          anomaly_reason: failureReason,
        });
      }
    }

    // -----------------------------------------------------------------
    // refund.processed
    // -----------------------------------------------------------------
    if (eventType === 'refund.processed') {
      const paymentId = payload.payment_id;
      const refundId = payload.id;

      // Find the original transaction by payment_id
      const { data: existing } = await supabase
        .from('transactions')
        .select('*')
        .eq('razorpay_payment_id', paymentId)
        .maybeSingle();

      if (existing) {
        await supabase
          .from('transactions')
          .update({
            razorpay_status: 'refunded',
            razorpay_refund_id: refundId,
            status: 'rejected',
          })
          .eq('id', existing.id);
      }
    }

    return new Response(JSON.stringify({ received: true, event: eventType }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
