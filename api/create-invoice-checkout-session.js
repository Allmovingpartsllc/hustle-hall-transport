const Stripe = require('stripe');
const SUPABASE_URL = 'https://ucopmutxwsrgnudsyuhz.supabase.co';

async function loadOrder(id) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Invoice service is not configured.');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = SUPABASE_URL + '/rest/v1/orders?id=eq.' + encodeURIComponent(id) + '&select=id,service,payload';
  const response = await fetch(url, { headers: { apikey: key, Authorization: 'Bearer ' + key } });
  if (!response.ok) throw new Error('Invoice record could not be loaded.');
  const rows = await response.json();
  return rows[0];
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe is not configured yet.' });

  try {
    const id = String((req.body && req.body.id) || '').trim();
    const token = String((req.body && req.body.token) || '').trim();
    if (!id || !token) return res.status(400).json({ error: 'A valid invoice is required.' });

    const row = await loadOrder(id);
    if (!row) return res.status(404).json({ error: 'Invoice not found.' });
    const order = row.payload || {};
    const invoice = order.invoice || {};
    if (!invoice.token || invoice.token !== token) return res.status(404).json({ error: 'Invoice not found.' });
    if (order.paymentStatus === 'Paid' || invoice.status === 'Paid') return res.status(409).json({ error: 'This invoice has already been paid.' });

    const amount = Number(invoice.amount);
    if (!Number.isFinite(amount) || amount < 0.5) return res.status(400).json({ error: 'A valid invoice amount is required.' });

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const invoiceUrl = 'https://hustlehall.allmovingparts.com/invoice.html?id=' + encodeURIComponent(id) + '&token=' + encodeURIComponent(token);
    const rideCount = Array.isArray(invoice.lineItems) && invoice.lineItems.length ? invoice.lineItems.length : 1;
    const description = rideCount > 1
      ? rideCount + ' itemized rides'
      : (invoice.description || 'Transportation services');

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: order.email || undefined,
      client_reference_id: row.id,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Hustle Hall Transport - Invoice ' + (invoice.number || row.id),
            description
          },
          unit_amount: Math.round(amount * 100)
        },
        quantity: 1
      }],
      metadata: {
        bookingId: row.id,
        invoiceNumber: invoice.number || '',
        paymentType: 'invoice',
        rideCount: String(rideCount)
      },
      success_url: invoiceUrl + '&payment=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: invoiceUrl + '&payment=cancelled'
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Invoice Stripe Checkout error:', error);
    return res.status(500).json({ error: 'Unable to start invoice payment.' });
  }
};
