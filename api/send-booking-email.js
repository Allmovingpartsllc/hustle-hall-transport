const ADMIN_EMAIL = 'HustleHall@allmovingparts.com';
const DEFAULT_FROM = 'Hustle Hall Transport <notifications@allmovingparts.com>';
const crypto = require('crypto');

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

function base64Url(value) {
  return Buffer.from(value).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function firebaseAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  }));
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(serviceAccount.private_key, 'base64url');
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${signature}` })
  });
  if (!tokenResponse.ok) throw new Error('Firebase authorization failed.');
  return (await tokenResponse.json()).access_token;
}

async function sendPushNotifications(event, order) {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON || !process.env.SUPABASE_SERVICE_ROLE_KEY) return;
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  const subscriptionsResponse = await fetch('https://ucopmutxwsrgnudsyuhz.supabase.co/rest/v1/push_subscriptions?select=token', {
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  if (!subscriptionsResponse.ok) throw new Error('Push subscriber lookup failed.');
  const subscriptions = await subscriptionsResponse.json();
  if (!subscriptions.length) return;
  const serviceName = order.service === 'package' ? 'package delivery' : 'ride';
  const title = event === 'booking' ? `New ${serviceName} request` : event === 'customer_cancelled' ? 'Order cancelled' : `Order update: ${order.status}`;
  const body = event === 'booking' ? `${order.customerName} submitted ${order.id}.` : event === 'customer_cancelled' ? `${order.customerName} cancelled ${order.id}.` : `${order.id} is now ${order.status}.`;
  const accessToken = await firebaseAccessToken(serviceAccount);
  await Promise.allSettled(subscriptions.map(({ token }) => fetch(`https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token, notification: { title, body }, webpush: { fcm_options: { link: 'https://hustlehall.allmovingparts.com/admin.html' } } } })
  })));
}

function messageCopy(event, order, serviceName) {
  if (event === 'customer_cancelled') {
    return {
      businessTitle: 'Customer cancelled a request',
      businessText: `The customer cancelled this ${serviceName} request.`,
      customerSubject: `Your Hustle Hall Transport request was cancelled - ${order.id}`,
      customerTitle: 'Your request was cancelled',
      customerText: 'Your cancellation has been received. Contact us if you need help or would like to make a new request.'
    };
  }
  if (event === 'status_update') {
    return {
      businessTitle: 'Order status updated',
      businessText: `This ${serviceName} request is now marked ${order.status}.`,
      customerSubject: `Your Hustle Hall Transport update: ${order.status}`,
      customerTitle: 'Your order has an update',
      customerText: `Your ${serviceName} request is now marked ${order.status}.`
    };
  }
  return {
    businessTitle: 'New Hustle Hall request',
    businessText: `A customer has submitted a ${serviceName} request.`,
    customerSubject: `We received your Hustle Hall Transport request - ${order.id}`,
    customerTitle: 'Request received',
    customerText: `We received your ${serviceName} request. A Hustle Hall Transport team member will confirm the details with you shortly.`
  };
}

module.exports = async (request, response) => {
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });
  if (!process.env.RESEND_API_KEY) return response.status(500).json({ error: 'Email service is not configured.' });

  const order = request.body?.order;
  const event = ['booking', 'status_update', 'customer_cancelled'].includes(request.body?.event) ? request.body.event : 'booking';
  if (!order || !order.id || !order.customerName || !order.phone || !order.pickup || !order.delivery) {
    return response.status(400).json({ error: 'A complete booking is required.' });
  }

  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  const serviceName = order.service === 'package' ? 'package delivery' : 'ride';
  const copy = messageCopy(event, order, serviceName);
  const orderTable = `<table style="width:100%;border-collapse:collapse">${details(order)}</table>`;
  const businessMessage = {
    from,
    to: [ADMIN_EMAIL],
    ...(isEmail(order.email) ? { reply_to: order.email } : {}),
    subject: `${copy.businessTitle} - ${order.id}`,
    html: `<div style="font-family:Arial,sans-serif;color:#241820"><h1 style="color:#d91f73">${escapeHtml(copy.businessTitle)}</h1><p>${escapeHtml(copy.businessText)}</p>${orderTable}<p style="margin-top:24px">Hustle Hard. Deliver Smart.</p></div>`
  };

  try {
    await sendWithResend(businessMessage);
    if (isEmail(order.email)) {
      await sendWithResend({
        from,
        to: [order.email],
        subject: copy.customerSubject,
        html: `<div style="font-family:Arial,sans-serif;color:#241820"><h1 style="color:#d91f73">${escapeHtml(copy.customerTitle)}</h1><p>Hi ${escapeHtml(order.customerName)},</p><p>${escapeHtml(copy.customerText)}</p>${orderTable}<p style="margin-top:24px"><strong>Hustle Hall Transport</strong><br>239-800-1380<br>Hustle Hard. Deliver Smart.</p></div>`
      });
    }
    try {
      await sendPushNotifications(event, order);
    } catch (pushError) {
      console.warn('Push notification error:', pushError);
    }
    return response.status(200).json({ ok: true });
  } catch (error) {
    console.error('Order notification error:', error);
    return response.status(502).json({ error: 'Email could not be sent.' });
  }
};
