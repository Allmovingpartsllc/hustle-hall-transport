const ADMIN_EMAIL = 'HustleHall@allmovingparts.com';
const DEFAULT_FROM = 'Hustle Hall Transport <notifications@allmovingparts.com>';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'
  }[character]));
}

function isEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function sendWithResend(payload) {
  const result = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!result.ok) throw new Error('Resend returned ' + result.status);
}

function row(label, value) {
  return '<tr><td style="padding:9px 12px;border:1px solid #eee;font-weight:700;vertical-align:top">' +
    escapeHtml(label) +
    '</td><td style="padding:9px 12px;border:1px solid #eee;white-space:pre-wrap">' +
    escapeHtml(value || 'Not provided') +
    '</td></tr>';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: 'Email service is not configured.' });

  const body = req.body || {};
  if (body.website) return res.status(200).json({ ok: true });

  const required = ['businessName','contactName','email','phone','partnershipType','frequency','serviceArea'];
  if (required.some((key) => !String(body[key] || '').trim())) {
    return res.status(400).json({ error: 'Please complete all required business fields.' });
  }
  if (!isEmail(body.email)) return res.status(400).json({ error: 'Enter a valid contact email address.' });

  const services = Array.isArray(body.services) ? body.services.filter(Boolean) : [];
  if (!services.length) return res.status(400).json({ error: 'Select at least one service.' });

  const invoiceEmail = String(body.invoiceEmail || '').trim();
  if (invoiceEmail && !isEmail(invoiceEmail)) return res.status(400).json({ error: 'Enter a valid invoice email address.' });

  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;
  const rows = [
    row('Business / organization', body.businessName),
    row('Contact person', body.contactName),
    row('Contact email', body.email),
    row('Phone', body.phone),
    row('Services requested', services.join(', ')),
    row('Partnership style', body.partnershipType),
    row('Expected frequency', body.frequency),
    row('Estimated monthly volume', body.estimatedVolume),
    row('Preferred start date', body.startDate),
    row('Primary service area / pickup locations', body.serviceArea),
    row('Common destinations / delivery areas', body.destinations),
    row('Preferred billing schedule', body.billingSchedule),
    row('Invoice email', invoiceEmail || body.email),
    row('Additional details', body.notes)
  ].join('');

  const adminHtml = '<div style="font-family:Arial,sans-serif;color:#241820">' +
    '<h1 style="color:#d91f73">New Business Partnership Request</h1>' +
    '<p><strong>' + escapeHtml(body.businessName) + '</strong> submitted a request for dedicated Hustle Hall business services and personalized invoicing.</p>' +
    '<table style="width:100%;border-collapse:collapse">' + rows + '</table>' +
    '<p style="margin-top:24px"><strong>Reply directly to this email to contact ' + escapeHtml(body.contactName) + '.</strong></p>' +
    '</div>';

  try {
    await sendWithResend({
      from,
      to: [ADMIN_EMAIL],
      reply_to: body.email,
      subject: 'Business Partnership Request - ' + body.businessName,
      html: adminHtml
    });

    await sendWithResend({
      from,
      to: [body.email],
      subject: 'We received your Hustle Hall business partnership request',
      html: '<div style="font-family:Arial,sans-serif;color:#241820">' +
        '<h1 style="color:#d91f73">Partnership request received</h1>' +
        '<p>Hi ' + escapeHtml(body.contactName) + ',</p>' +
        '<p>Thank you for contacting Hustle Hall Transport. We received your request for business transportation services and will review the details you provided.</p>' +
        '<p>If the partnership is a fit, we can discuss dedicated rides, package delivery, scheduling, and a personalized invoicing arrangement for your organization.</p>' +
        '<p style="margin-top:24px"><strong>Hustle Hall Transport</strong><br>HustleHall@allmovingparts.com<br>239-800-1380<br>Hustle Hard. Deliver Smart.</p>' +
        '</div>'
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Business partnership email error:', error);
    return res.status(502).json({ error: 'Your request could not be emailed right now. Please email HustleHall@allmovingparts.com directly.' });
  }
};