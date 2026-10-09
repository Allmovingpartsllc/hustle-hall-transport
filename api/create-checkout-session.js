const Stripe = require('stripe');

const PROMO_MINIMUM_SUBTOTAL = 15;
const PROMO_CODES = {
  WELCOME10: { type: 'percent', value: 10, maxDiscount: 5 },
  LOCAL5: { type: 'fixed', value: 5, minimumSubtotal: 15 },
  SCHOOL: { type: 'percent', value: 30, maxDiscount: 5, service: 'ride' },
  TKA: { type: 'percent', value: 45 },
};

function isTuesdayFiveEligible(order) {
  if (order.service !== 'ride' || order.rideType === 'multi') return false;
  const miles = Math.max(0, Number(order.miles) || 0);
  if (!order.date || !order.time || miles <= 0 || miles > 15) return false;
  const date = new Date(order.date + 'T12:00:00');
  if (Number.isNaN(date.getTime()) || date.getDay() !== 2) return false;
  const parts = String(order.time).split(':').map(Number);
  const pickupMinutes = (parts[0] * 60) + parts[1];
  return pickupMinutes >= (14 * 60) && pickupMinutes <= (17 * 60);
}

function calculatePromoDiscount(order, subtotal) {
  if (isTuesdayFiveEligible(order)) return Math.max(0, subtotal - 5);

  const code = String(order.promoCode || '').trim().toUpperCase();
  if (!code || code === 'TUESDAY5') return 0;

  const promo = PROMO_CODES[code];
  if (!promo) return 0;
  if (promo.service && promo.service !== order.service) return 0;

  const minimum = Math.max(PROMO_MINIMUM_SUBTOTAL, promo.minimumSubtotal || 0);
  if (subtotal < minimum) return 0;

  const rawDiscount = promo.type === 'percent'
    ? subtotal * (promo.value / 100)
    : promo.value;

  return Math.min(subtotal, promo.maxDiscount || rawDiscount, rawDiscount);
}

function calculateCombinedInvoiceTotal(order) {
  const items = Array.isArray(order.combinedInvoice?.items) ? order.combinedInvoice.items : [];
  if (!items.length) throw new Error('A combined invoice must include at least one service.');
  const total = items.reduce((sum, item) => sum + Math.max(0, Number(item.total) || 0), 0);
  if (!Number.isFinite(total) || total < 0.5) throw new Error('A valid combined invoice amount is required.');
  return total;
}

function calculateTotal(order) {
  if (Array.isArray(order.combinedInvoice?.items) && order.combinedInvoice.items.length) {
    return calculateCombinedInvoiceTotal(order);
  }
  const miles = Math.max(0, Number(order.miles) || 0);

  if (order.service === 'package') {
    const prices = { small: 5, medium: 10, large: 20, extraLarge: 50 };
    const base = prices[order.size || order.packageSize] || prices.small;
    const additionalMiles = Math.max(0, miles - 20);
    const surcharge = miles > 20 ? 10 + (additionalMiles * 0.35) : 0;
    const subtotal = base + surcharge;
    return Math.max(0, subtotal - calculatePromoDiscount(order, subtotal));
  }

  if (order.rideType === 'multi' || order.quotePending || order.preApprovalEstimate) {
    throw new Error('Multi-day ride requests must be approved before payment.');
  }

  const minutes = Math.max(0, Number(order.minutes) || 0);
  const minimumFare = 5;
  const base = 5;
  const firstTierMiles = Math.min(miles, 20);
  const longTripMiles = Math.max(0, miles - 20);
  const mileCharge = (firstTierMiles * 0.95) + (longTripMiles * 0.85);
  const minuteCharge = minutes * 0.15;
  const subtotal = Math.max(minimumFare, base + mileCharge + minuteCharge);

  if (isTuesdayFiveEligible(order)) return 5;

  return Math.max(0, subtotal - calculatePromoDiscount(order, subtotal));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe is not configured yet.' });

  try {
    const { order } = req.body || {};
    const isCombinedInvoice = Boolean(order?.combinedInvoice && Array.isArray(order.combinedInvoice.items) && order.combinedInvoice.items.length);
    if (!order || !order.id || (!['ride', 'package'].includes(order.service) && !isCombinedInvoice)) {
      return res.status(400).json({ error: 'A valid booking is required.' });
    }

    const amount = Number(calculateTotal(order).toFixed(2));
    if (!Number.isFinite(amount) || amount < 0.5) {
      return res.status(400).json({ error: 'A valid booking amount is required.' });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const serviceName = isCombinedInvoice
      ? 'Combined Invoice ' + (order.combinedInvoice.id || order.id)
      : (order.service === 'package' ? 'Package Delivery' : 'Ride');
    const receiptUrl = 'https://hustlehall.allmovingparts.com/receipt.html?id=' + encodeURIComponent(order.id);

    const session = await stripe.checkout.sessions.create({
      integration_identifier: 'hht_combined_invoice_' + Math.random().toString(36).slice(2, 10),
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
      metadata: {
        bookingId: order.id,
        customerName: order.customerName || '',
        serviceType: order.service,
        paymentType: isCombinedInvoice ? 'combined_invoice' : 'booking',
        combinedInvoiceId: isCombinedInvoice ? (order.combinedInvoice.id || '') : '',
        promoCode: isTuesdayFiveEligible(order) ? 'TUESDAY5' : (order.promoCode || ''),
        bookingTotal: (isCombinedInvoice ? amount : Number(order.total || 0)).toFixed(2),
        chargedTotal: amount.toFixed(2)
      },
      success_url: receiptUrl + '&payment=success&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: receiptUrl + '&payment=cancelled'
    });

    return res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (error) {
    console.error('Stripe Checkout error:', error);
    return res.status(500).json({ error: error.message || 'Unable to start Stripe Checkout.' });
  }
};
