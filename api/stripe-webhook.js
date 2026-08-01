const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  const signature = req.headers["stripe-signature"];

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    console.error("Webhook signature verification failed:", error.message);

    return res.status(400).send(`Webhook error: ${error.message}`);
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;

      console.log("Hustle Hall payment completed:", {
        sessionId: session.id,
        paymentStatus: session.payment_status,
        customerEmail: session.customer_details?.email,
        amountTotal: session.amount_total,
        bookingId: session.metadata?.bookingId,
      });

      /*
       * Later, update the booking in Supabase here:
       * payment_status: "paid"
       * stripe_session_id: session.id
       */

      break;
    }

    case "checkout.session.async_payment_succeeded":
      console.log("Delayed Stripe payment succeeded.");
      break;

    case "checkout.session.async_payment_failed":
      console.log("Delayed Stripe payment failed.");
      break;

    default:
      console.log(`Unhandled Stripe event: ${event.type}`);
  }

  return res.status(200).json({ received: true });
};

module.exports.config = {
  api: {
    bodyParser: false,
  },
};