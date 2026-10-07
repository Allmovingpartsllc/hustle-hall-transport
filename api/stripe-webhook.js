const Stripe = require('stripe');

const SUPABASE_URL = 'https://ucopmutxwsrgnudsyuhz.supabase.co';

function headers() {
  return {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  };
}

async function loadOrder(id) {
  const url = `${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(id)}&select=id,payload`;
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) throw new Error('Could not find the booking to update payment status.');
  const rows = await response.json();
  return rows[0];
}

async function saveOrder(id, payload) {
  const url = `${SUPABASE_URL}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`;
  const update = await fetch(url, {
    method: 'PATCH',
    headers: { ...headers(), Prefer: 'return=minimal' },
    body: JSON.stringify({ payload })
  });
  if (!update.ok) throw new Error('Could not save payment status.');
}

async function updatePaymentStatus(session, paymentStatus) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !session.metadata?.bookingId) return;

  const host = await loadOrder(session.metadata.bookingId);
  if (!host) return;
  const hostPayload = host.payload || {};
  const invoice = hostPayload.invoice || {};
  const relatedIds = session.metadata?.paymentType === 'invoice' && Array.isArray(invoice.relatedOrderIds) && invoice.relatedOrderIds.length
    ? invoice.relatedOrderIds.map(String)
    : [session.metadata.bookingId];

  const paidAt = paymentStatus === 'Paid' ? new Date().toLocaleString() : undefined;

  for (const orderId of relatedIds) {
    const row = orderId === host.id ? host : await loadOrder(orderId);
    if (!row) continue;
    const currentPayload = row.payload || {};
    const payload = {
      ...currentPayload,
      paymentStatus,
      stripeSessionId: session.id,
      paidAt
    };

    if (orderId === host.id && currentPayload.invoice && session.metadata?.paymentType === 'invoice') {
      payload.invoice = {
        ...currentPayload.invoice,
        status: paymentStatus === 'Paid' ? 'Paid' : currentPayload.invoice.status,
        paidAt: paidAt || currentPayload.invoice.paidAt,
        stripeSessionId: session.id
      };
    }

    if (currentPayload.invoiceRef && session.metadata?.paymentType === 'invoice') {
      payload.invoiceRef = {
        ...currentPayload.invoiceRef,
        paymentStatus,
        paidAt: paidAt || currentPayload.invoiceRef.paidAt
      };
    }

    await saveOrder(orderId, payload);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(500).send('Stripe webhook is not configured.');

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === 'checkout.session.completed') await updatePaymentStatus(event.data.object, 'Paid');
    if (event.type === 'checkout.session.async_payment_succeeded') await updatePaymentStatus(event.data.object, 'Paid');
    if (event.type === 'checkout.session.async_payment_failed') await updatePaymentStatus(event.data.object, 'Payment failed');
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Stripe webhook error:', error.message);
    return res.status(400).send('Webhook verification failed.');
  }
};

module.exports.config = { api: { bodyParser: false } };
