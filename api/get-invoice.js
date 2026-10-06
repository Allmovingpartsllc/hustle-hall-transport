const SUPABASE_URL = 'https://ucopmutxwsrgnudsyuhz.supabase.co';

async function loadOrder(id) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Invoice service is not configured.');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = SUPABASE_URL + '/rest/v1/orders?id=eq.' + encodeURIComponent(id) + '&select=id,service,status,total,payload,created_at';
  const response = await fetch(url, { headers: { apikey: key, Authorization: 'Bearer ' + key } });
  if (!response.ok) throw new Error('Invoice record could not be loaded.');
  const rows = await response.json();
  return rows[0];
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const id = String((req.query && req.query.id) || '').trim();
    const token = String((req.query && req.query.token) || '').trim();
    if (!id || !token) return res.status(400).json({ error: 'A valid invoice link is required.' });

    const row = await loadOrder(id);
    const order = (row && row.payload) || {};
    const invoice = order.invoice || {};
    if (!row || !invoice.token || invoice.token !== token) return res.status(404).json({ error: 'Invoice not found.' });

    const amount = Number(invoice.amount);
    if (!Number.isFinite(amount) || amount < 0.5) return res.status(422).json({ error: 'This invoice does not have a valid amount.' });

    return res.status(200).json({ invoice: {
      number: invoice.number || ('HHT-INV-' + id),
      orderId: row.id,
      billTo: invoice.billTo || order.customerName || 'Customer',
      customerName: order.customerName || '',
      customerEmail: order.email || '',
      customerPhone: order.phone || '',
      description: invoice.description || (row.service === 'package' ? 'Transportation / delivery service' : 'Ride transportation'),
      serviceDate: invoice.serviceDate || order.date || '',
      issuedAt: invoice.issuedAt || row.created_at,
      dueDate: invoice.dueDate || '',
      notes: invoice.notes || '',
      amount: amount,
      pickup: order.pickup || '',
      delivery: order.delivery || '',
      paymentStatus: order.paymentStatus || 'Invoice sent',
      status: invoice.status || (order.paymentStatus === 'Paid' ? 'Paid' : 'Open')
    }});
  } catch (error) {
    console.error('Invoice lookup error:', error);
    return res.status(500).json({ error: 'Unable to load this invoice right now.' });
  }
};