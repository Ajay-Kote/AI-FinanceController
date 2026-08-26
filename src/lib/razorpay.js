import { supabase } from './supabase';

// =====================================================================
// RAZORPAY PAYMENT HELPER (frontend)
// =====================================================================
// Opens Razorpay Checkout in a popup window to escape iframe sandbox
// restrictions. The popup communicates the result via postMessage.
//
// All amounts are in INR (rupees). The backend converts to paise.
// =====================================================================

let messageHandler = null;
let popupCallback = null;
let popupWindow = null;

function ensureMessageListener() {
  if (messageHandler) return;
  messageHandler = (event) => {
    if (!event.data || typeof event.data.type !== 'string') return;
    if (!event.data.type.startsWith('razorpay_')) return;
    if (popupCallback) {
      popupCallback(event.data);
    }
  };
  window.addEventListener('message', messageHandler);
}

export async function startRazorpayPayment({ amount, description, onSuccess, onError }) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Not authenticated');

    const createOrderUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/razorpay-payment`;
    const orderResp = await fetch(createOrderUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        action: 'create_order',
        amount,
        description,
      }),
    });

    if (!orderResp.ok) {
      const errData = await orderResp.json().catch(() => ({}));
      throw new Error(errData.error || `Failed to create order (${orderResp.status})`);
    }

    const orderData = await orderResp.json();
    const orderId = orderData.order_id;
    const amountInPaise = orderData.amount_paise;
    const keyId = orderData.key_id;

    if (!keyId) {
      throw new Error('Razorpay key ID not returned from server.');
    }

    const checkoutUrl = new URL('/razorpay-checkout.html', window.location.origin);
    checkoutUrl.searchParams.set('key', keyId);
    checkoutUrl.searchParams.set('amount', String(amountInPaise));
    checkoutUrl.searchParams.set('order_id', orderId);
    checkoutUrl.searchParams.set('currency', 'INR');
    checkoutUrl.searchParams.set('name', 'FinControl AI');
    checkoutUrl.searchParams.set('description', description || 'Payment');
    checkoutUrl.searchParams.set('email', sessionData.session?.user?.email ?? '');
    checkoutUrl.searchParams.set('origin', window.location.origin);

    ensureMessageListener();

    popupCallback = async (data) => {
      if (data.type === 'razorpay_success') {
        try {
          const verifyResp = await fetch(createOrderUrl, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({
              action: 'verify_payment',
              razorpay_order_id: data.razorpay_order_id,
              razorpay_payment_id: data.razorpay_payment_id,
              razorpay_signature: data.razorpay_signature,
              amount,
              description,
            }),
          });

          if (!verifyResp.ok) {
            const errData = await verifyResp.json().catch(() => ({}));
            throw new Error(errData.error || 'Payment verification failed');
          }

          const verifyData = await verifyResp.json();
          popupCallback = null;
          if (popupWindow) { popupWindow.close(); popupWindow = null; }
          if (onSuccess) onSuccess(verifyData.transaction);
        } catch (verifyErr) {
          popupCallback = null;
          if (onError) onError(verifyErr);
        }
      } else if (data.type === 'razorpay_dismissed') {
        popupCallback = null;
        if (popupWindow) { popupWindow.close(); popupWindow = null; }
        if (onError) onError(new Error('Payment cancelled'));
      } else if (data.type === 'razorpay_error') {
        popupCallback = null;
        if (popupWindow) { popupWindow.close(); popupWindow = null; }
        if (onError) onError(new Error(data.error || 'Payment failed'));
      }
    };

    const popupFeatures = 'width=500,height=650,scrollbars=yes,resizable=yes';
    popupWindow = window.open(checkoutUrl.toString(), 'razorpay_checkout', popupFeatures);

    if (!popupWindow) {
      throw new Error('Popup was blocked by the browser. Please allow popups for this site and try again.');
    }

    const checkClosed = setInterval(() => {
      if (popupWindow && popupWindow.closed) {
        clearInterval(checkClosed);
        if (popupCallback) {
          popupCallback = null;
          popupWindow = null;
          if (onError) onError(new Error('Payment window was closed'));
        }
      }
    }, 500);
  } catch (err) {
    if (onError) onError(err);
  }
}

// =====================================================================
// RAZORPAY REFUND HELPER (frontend)
// =====================================================================
// Calls the razorpay-refund edge function to process a refund.
// amount is optional — if omitted, a full refund is processed.
// =====================================================================
export async function processRazorpayRefund({ transactionId, paymentId, amount, onSuccess, onError }) {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) throw new Error('Not authenticated');

    const refundUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/razorpay-refund`;
    const resp = await fetch(refundUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        transaction_id: transactionId,
        payment_id: paymentId,
        amount: amount || null,
      }),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Refund failed (${resp.status})`);
    }

    const data = await resp.json();
    if (onSuccess) onSuccess(data);
  } catch (err) {
    if (onError) onError(err);
  }
}
