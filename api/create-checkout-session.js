const Stripe = require('stripe');

module.exports = async (request, response) => {
  if (request.method !== 'POST') {
    return response.status(405).json({
      error: 'Method not allowed.'
    });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return response.status(500).json({
      error: 'Stripe is not configured.'
    });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const {
      amount,
      customerEmail,
      customerName,
      serviceType,
      bookingId,
      cancelUrl
    } = request.body || {};

    const amountInDollars = Number(amount);
    const amountInCents = Math.round(amountInDollars * 100);

    if (
      !Number.isFinite(amountInDollars) ||
      amountInDollars < 0.5 ||
      amountInDollars > 5000
    ) {
      return response.status(400).json({
        error: 'A valid payment amount is required.'
      });
    }

    const validEmail =
      typeof customerEmail === 'string' &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail);

    const safeServiceType =
      typeof serviceType === 'string' && serviceType.trim()
        ? serviceType.trim().slice(0, 100)
        : 'Transportation Booking';

    const safeBookingId =
      typeof bookingId === 'string'
        ? bookingId.slice(0, 100)
        : '';

    const safeCustomerName =
      typeof customerName === 'string'
        ? customerName.slice(0, 100)
        : '';

    const allowedCancelPages = [
      '/ride-booking.html',
      '/package-booking.html'
    ];

    const cancelPage = allowedCancelPages.includes(cancelUrl)
      ? cancelUrl
      : '/ride-booking.html';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',

      customer_email: validEmail
        ? customerEmail
        : undefined,

      payment_method_types: ['card'],

      line_items: [
        {
          price_data: {
            currency: 'usd',

            product_data: {
              name: `Hustle Hall Transport — ${safeServiceType}`,

              description: safeBookingId
                ? `Booking number: ${safeBookingId}`
                : undefined
            },

            unit_amount: amountInCents
          },

          quantity: 1
        }
      ],

      metadata: {
        bookingId: safeBookingId,
        customerName: safeCustomerName,
        serviceType: safeServiceType
      },

      payment_intent_data: {
        metadata: {
          bookingId: safeBookingId,
          customerName: safeCustomerName,
          serviceType: safeServiceType
        }
      },

      success_url:
        'https://hustlehall.allmovingparts.com/receipt.html' +
        '?payment=success' +
        '&session_id={CHECKOUT_SESSION_ID}',

      cancel_url:
        `https://hustlehall.allmovingparts.com${cancelPage}` +
        '?payment=cancelled'
    });

    return response.status(200).json({
      url: session.url,
      sessionId: session.id
    });
  } catch (error) {
    console.error('Stripe Checkout error:', error);

    return response.status(500).json({
      error:
        error?.message ||
        'Unable to start Stripe Checkout.'
    });
  }
};
