const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const {
      amount,
      customerEmail,
      customerName,
      serviceType,
      bookingId,
    } = req.body || {};

    const amountInDollars = Number(amount);

    if (
      !Number.isFinite(amountInDollars) ||
      amountInDollars < 0.5
    ) {
      return res.status(400).json({
        error: "A valid payment amount is required.",
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",

      customer_email: customerEmail || undefined,

      line_items: [
        {
          price_data: {
            currency: "usd",

            product_data: {
              name: serviceType
                ? `Hustle Hall Transport — ${serviceType}`
                : "Hustle Hall Transport Booking",
            },

            unit_amount: Math.round(amountInDollars * 100),
          },

          quantity: 1,
        },
      ],

      metadata: {
        bookingId: bookingId || "",
        customerName: customerName || "",
        serviceType: serviceType || "",
      },

      success_url:
        "https://hustlehall.allmovingparts.com/receipt.html?payment=success&session_id={CHECKOUT_SESSION_ID}",

      cancel_url:
        "https://hustlehall.allmovingparts.com/ride-booking.html?payment=cancelled",
    });

    return res.status(200).json({
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error("Stripe Checkout error:", error);

    return res.status(500).json({
      error: "Unable to start Stripe Checkout.",
    });
  }
};