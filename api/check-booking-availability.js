const SUPABASE_URL = 'https://ucopmutxwsrgnudsyuhz.supabase.co';
const CLOSE_DISTANCE_MILES = 5;
const NON_BLOCKING_STATUSES = new Set(['Rejected', 'Cancelled', 'Delivered', 'Completed']);

function minutesFromTime(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function bookingWindow(order) {
  if (!order?.date || !order?.time) return null;
  const day = Date.parse(`${order.date}T00:00:00Z`) / 60000;
  const startTime = minutesFromTime(order.time);
  if (!Number.isFinite(day) || startTime === null) return null;
  const start = day + startTime;
  const preferredEnd = minutesFromTime(order.dropoffTime);
  let end = preferredEnd !== null && preferredEnd > startTime
    ? day + preferredEnd
    : start + Math.max(1, Number(order.minutes) || 30);
  return { start, end };
}

function overlaps(a, b) {
  return Boolean(a && b && a.start < b.end && b.start < a.end);
}

function haversineMiles(a, b) {
  const toRad = (degrees) => degrees * Math.PI / 180;
  const lat1 = Number(a.lat), lon1 = Number(a.lon), lat2 = Number(b.lat), lon2 = Number(b.lon);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return Infinity;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 3958.7613 * (2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

const geocodeCache = new Map();
async function geocode(address) {
  const key = String(address || '').trim().toLowerCase();
  if (!key) return null;
  if (geocodeCache.has(key)) return geocodeCache.get(key);
  const endpoint = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(address)}`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'HustleHallTransport/1.0 (booking availability)'
    }
  });
  if (!response.ok) return null;
  const [place] = await response.json();
  const result = place ? { lat: Number(place.lat), lon: Number(place.lon) } : null;
  geocodeCache.set(key, result);
  return result;
}

async function point(order, prefix) {
  const lat = Number(order?.[`${prefix}Lat`]);
  const lon = Number(order?.[`${prefix}Lon`]);
  if (Number.isFinite(lat) && Number.isFinite(lon) && order?.[`${prefix}Lat`] !== '' && order?.[`${prefix}Lon`] !== '') {
    return { lat, lon };
  }
  const address = prefix === 'pickup' ? order?.pickup : order?.delivery;
  return geocode(address);
}

async function closeEnough(newOrder, existingOrder) {
  const [newPickup, oldPickup, newDelivery, oldDelivery] = await Promise.all([
    point(newOrder, 'pickup'),
    point(existingOrder, 'pickup'),
    point(newOrder, 'delivery'),
    point(existingOrder, 'delivery')
  ]);
  if (!newPickup || !oldPickup || !newDelivery || !oldDelivery) return false;
  return haversineMiles(newPickup, oldPickup) <= CLOSE_DISTANCE_MILES &&
    haversineMiles(newDelivery, oldDelivery) <= CLOSE_DISTANCE_MILES;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const order = req.body?.order;
  if (!order || !['ride', 'package'].includes(order.service)) {
    return res.status(400).json({ error: 'A ride or package request is required.' });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Secure booking availability is not configured.' });
  }

  const requestedWindow = bookingWindow(order);
  if (!requestedWindow) {
    return res.status(200).json({
      requiresApproval: true,
      reason: 'The ride schedule could not be compared automatically.'
    });
  }

  try {
    const url = `${SUPABASE_URL}/rest/v1/orders?select=id,status,payload`;
    const response = await fetch(url, {
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
      }
    });
    if (!response.ok) throw new Error(`Booking lookup returned ${response.status}`);
    const rows = await response.json();
    const conflicts = [];

    for (const row of rows) {
      const existing = { ...(row.payload || {}), status: row.status || row.payload?.status };
      if (NON_BLOCKING_STATUSES.has(existing.status)) continue;
      if (!overlaps(requestedWindow, bookingWindow(existing))) continue;
      conflicts.push({ id: row.id, service: existing.service || row.payload?.service || 'request' });
    }

    if (conflicts.length) {
      return res.status(200).json({
        requiresApproval: true,
        reason: 'This request overlaps another active booking and needs manual approval before confirmation or payment.',
        conflicts: conflicts.map((item) => item.id)
      });
    }

    return res.status(200).json({
      requiresApproval: false,
      nearbyOverlap: false,
      reason: 'No active schedule conflict was found.'
    });
  } catch (error) {
    console.error('Booking availability error:', error);
    return res.status(500).json({ error: 'Unable to verify ride availability.' });
  }
};
