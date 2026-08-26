import { supabase } from './supabase';

// =====================================================================
// RAZORPAY PAYMENT HELPER (frontend)
// =====================================================================
// This module handles the Razorpay Checkout flow from the browser.
//
// IMPORTANT: The app runs inside an iframe (Bolt preview). Razorpay Checkout
// opens its own iframe to api.razorpay.com, and browsers block nested
// iframes from external domains. To work around this, we open a standalone
// payment page (public/razorpay-checkout.html) in a NEW top-level popup
// window that escapes the iframe sandbox. The popup communicates the
// payment result back to us via postMessage.
//
// Flow:
//   1. Call our backend edge function to create a Razorpay order
//   2. Open /razorpay-checkout.html in a new window with the order details
//   3. The popup opens Razorpay Checkout and sends the result via postMessage
//   4. We verify the payment signature on the backend
//   5. The backend creates a transaction in the database
// =====================================================================

// Listen for postMessage from the Razorpay checkout popup.
let messageHandler = null;

function ensureMessageListener() {
  if (messageHandler) return;
  messageHandler = (event) => {
    if (!event.data || typeof event.data.type !== 'string') return;
    if (!event.data.type.startsWith('razorpay_')) return;
    // Dispatch to the active callback
    if (popupCallback) {
      popupCallback(event.data);
    }
  };
  window.addEventListener('message', messageHandler);
}

let popupCallback = null;
let popupWindow = null;

// Start a Razorpay payment flow.
// amount: number in USD (will be converted to INR paise for Razorpay test mode)
// description: description for the payment
// onSuccess: callback after successful verification (receives the new transaction)
// onError: callback on failure
export async function startRazorpayPayment({ amount, description, onSuccess, onError }) {
  try {
    // Step 1: Create a Razorpay order via our backend edge function.
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
      throw new Error('Razorpay key ID not returned from server. Check that RAZORPAY_KEY_ID secret is set.');
    }

    // Step 2: Open the standalone payment page in a new popup window.
    // This escapes the iframe sandbox so Razorpay Checkout can load its own iframe.
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

    // Set up the callback for the postMessage from the popup.
    popupCallback = async (data) => {
      if (data.type === 'razorpay_success') {
        // Step 3: Verify the payment signature on the backend.
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

    // Open the popup (needs to be a direct user-gesture-adjacent call).
    // Width/height are large enough for the Razorpay modal.
    const popupFeatures = 'width=500,height=650,scrollbars=yes,resizable=yes';
    popupWindow = window.open(checkoutUrl.toString(), 'razorpay_checkout', popupFeatures);

    if (!popupWindow) {
      throw new Error('Popup was blocked by the browser. Please allow popups for this site and try again.');
    }

    // Monitor the popup window for being closed manually (without sending a message).
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
