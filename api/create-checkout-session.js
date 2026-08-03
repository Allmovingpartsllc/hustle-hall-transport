const Stripe = require('stripe');

function calculateTotal(order) {
  const miles = Math.max(0, Number(order.miles) || 0);
  if (order.service === 'package') {
    const prices = { small: 5, medium: 10, large: 20, extraLarge: 50 };
    const base = prices[order.size || order.packageSize] || prices.small;
    const additionalMiles = Math.max(0, miles - 20);
    return base + (miles > 20 ? 10 + (additionalMiles * 0.35) : 0);
  }
  const minutes = Math.max(0, Number(order.minutes) || 0);
  const base = miles <= 5 ? 5 : 4.25;
  return base + (miles * 0.25) + (minutes * 0.10);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe is not configured yet.' });

  try {
    const { order } = req.body || {};
    if (!order || !order.id || !['ride', 'package'].includes(order.service)) {
      return res.status(400).json({ error: 'A valid booking is required.' });
    }

    const amount = calculateTotal(order);
    if (!Number.isFinite(amount) || amount < 0.5) return res.status(400).json({ error: 'A valid booking amount is required.' });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const serviceName = order.service === 'package' ? 'Package Delivery' : 'Ride';
    const page = order.service === 'package' ? 'package-booking' : 'ride-booking';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: order.email || undefined,
      client_reference_id: order.id,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `Hustle Hall Transport - ${serviceName}` },
          unit_amount: Math.round(amount * 100)
        },
        quantity: 1
      }],
      metadata: { bookingId: order.id, customerName: order.customerName || '', serviceType: order.service },
      success_url: `https://hustlehall.allmovingparts.com/receipt.html?id=${encodeURIComponent(order.id)}&payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://hustlehall.allmovingparts.com/${page}.html?payment=cancelled`
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Stripe Checkout error:', error);
    return res.status(500).json({ error: 'Unable to start Stripe Checkout.' });
  }
};
