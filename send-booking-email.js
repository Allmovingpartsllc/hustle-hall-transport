const ADMIN_EMAIL = 'HustleHall@allmovingparts.com';
const DEFAULT_FROM = 'Hustle Hall Transport <notifications@allmovingparts.com>';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function details(order) {
  const rows = [
    ['Order number', order.id],
    ['Service', order.service === 'package' ? 'Package delivery' : 'Ride request'],
    ['Status', order.status],
    ['Customer', order.customerName],
    ['Phone', order.phone],
    ['Pickup', order.pickup],
    ['Destination', order.delivery],
    ['Requested date', order.date || 'Not specified'],
    ['Requested time', order.time || 'Not specified'],
    ['Distance', order.miles ? `${order.miles} miles` : 'To be confirmed'],
    ['Estimated total', Number.isFinite(Number(order.total)) ? `$${Number(order.total).toFixed(2)}` : 'To be confirmed']
  ];
  if (order.service === 'package') rows.splice(8, 0, ['Package', order.size || order.packageSize || 'Not specified']);
  return rows.map(([label, value]) => `<tr><td style="padding:8px 12px;border:1px solid #eee;font-weight:700">${escapeHtml(label)}</td><td style="padding:8px 12px;border:1px solid #eee">${escapeHtml(value)}</td></tr>`).join('');
}

async function sendWithResend(payload) {
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!result.ok) throw new Error(`Resend returned ${result.status}`);
}

module.exports = async (request, response) => {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });
  if (!process.env.RESEND_API_KEY) return response.status(500).json({ error: 'Email service is not configured.' });

  const order = request.body?.order;
  if (!order || !order.id || !order.customerName || !order.phone || !order.pickup || !order.delivery) {
    return response.status(400).json({ error: 'A complete booking is required.' });
  }

  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  const serviceName = order.service === 'package' ? 'package delivery' : 'ride';
  const orderTable = `<table style="width:100%;border-collapse:collapse">${details(order)}</table>`;
  const businessMessage = {
    from,
    to: [ADMIN_EMAIL],
    ...(isEmail(order.email) ? { reply_to: order.email } : {}),
    subject: `New ${serviceName} request — ${order.id}`,
    html: `<div style="font-family:Arial,sans-serif;color:#241820"><h1 style="color:#d91f73">New Hustle Hall request</h1><p>A customer has submitted a ${escapeHtml(serviceName)} request.</p>${orderTable}<p style="margin-top:24px">Hustle Hard. Deliver Smart.</p></div>`
  };

  try {
    await sendWithResend(businessMessage);
    if (isEmail(order.email)) {
      await sendWithResend({
        from,
        to: [order.email],
        subject: `We received your Hustle Hall Transport request — ${order.id}`,
        html: `<div style="font-family:Arial,sans-serif;color:#241820"><h1 style="color:#d91f73">Request received</h1><p>Hi ${escapeHtml(order.customerName)},</p><p>We received your ${escapeHtml(serviceName)} request. A Hustle Hall Transport team member will confirm the details with you shortly.</p>${orderTable}<p style="margin-top:24px"><strong>Hustle Hall Transport</strong><br>239-800-1380<br>Hustle Hard. Deliver Smart.</p></div>`
      });
    }
    return response.status(200).json({ ok: true });
  } catch (error) {
    console.error('Booking email error:', error);
    return response.status(502).json({ error: 'Email could not be sent.' });
  }
};
