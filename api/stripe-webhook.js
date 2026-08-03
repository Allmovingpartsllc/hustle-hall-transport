const Stripe = require('stripe');

async function updatePaymentStatus(session, paymentStatus) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !session.metadata?.bookingId) return;
  const orderUrl = `https://ucopmutxwsrgnudsyuhz.supabase.co/rest/v1/orders?id=eq.${encodeURIComponent(session.metadata.bookingId)}&select=payload`;
  const headers = {
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json'
  };
  const lookup = await fetch(orderUrl, { headers });
  if (!lookup.ok) throw new Error('Could not find the booking to update payment status.');
  const [booking] = await lookup.json();
  if (!booking) return;

  const payload = {
    ...(booking.payload || {}),
    paymentStatus,
    stripeSessionId: session.id,
    paidAt: paymentStatus === 'Paid' ? new Date().toLocaleString() : undefined
  };
  const update = await fetch(orderUrl, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify({ payload })
  });
  if (!update.ok) throw new Error('Could not save payment status.');
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
