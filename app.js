/**
 * Shared site behavior. Future booking, receipt, tracking, admin, and driver
 * pages can use this file for common navigation and UI helpers.
 */
const hhtSupabaseReady = new Promise((resolve, reject) => {
  const finish = () => resolve(window.supabase.createClient(
    'https://ucopmutxwsrgnudsyuhz.supabase.co',
    'sb_publishable_u4DgPycwqc7FCTjB6_0UYg_1Q5dcNaw'
  ));
  if (window.supabase) { finish(); return; }
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
  script.onload = finish;
  script.onerror = () => reject(new Error('The secure account service could not be reached.'));
  document.head.append(script);
});
const menuButton = document.querySelector('.menu-toggle');
const mainNavigation = document.querySelector('.main-nav');

if (menuButton && mainNavigation) {
  menuButton.addEventListener('click', () => {
    const isOpen = mainNavigation.classList.toggle('is-open');
    menuButton.setAttribute('aria-expanded', String(isOpen));
    menuButton.querySelector('.sr-only').textContent = isOpen ? 'Close menu' : 'Open menu';
  });

  mainNavigation.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      mainNavigation.classList.remove('is-open');
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.querySelector('.sr-only').textContent = 'Open menu';
    });
  });
}

const HHT_ORDERS = 'hht-orders';
const PRICES = { small: 5, medium: 10, large: 20, extraLarge: 50 };
const statuses = ['Requested', 'Accepted', 'Rejected', 'Cancelled', 'Driver Assigned', 'Driver En Route', 'Picked Up', 'In Transit', 'Delivered', 'Completed'];
const readOrders = () => JSON.parse(localStorage.getItem(HHT_ORDERS) || '[]');
const saveOrders = (orders) => localStorage.setItem(HHT_ORDERS, JSON.stringify(orders));
const money = (value) => `$${Number(value || 0).toFixed(2)}`;
const makeId = () => `HHT-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(Date.now()).slice(-5)}`;

function calculatePackage(form) {
  const size = form.elements.packageSize?.value || 'small';
  const base = PRICES[size];
  const miles = Number(form.elements.miles?.value || 0);
  const surcharge = miles > 20 ? 10 : 0;
  form.querySelector('[data-base-price]').textContent = money(base);
  form.querySelector('[data-surcharge]').textContent = money(surcharge);
  form.querySelector('[data-total]').textContent = money(base + surcharge);
  return { base, miles, surcharge, total: base + surcharge, size };
}

function calculateRide(form) {
  const miles = Number(form.elements.miles?.value || 0);
  const base = miles < 5 ? 5 : 1.5;
  const minutes = Number(form.elements.minutes?.value || 0);
  const mileCharge = miles * 0.25;
  const minuteCharge = minutes * 0.1;
  const total = base + mileCharge + minuteCharge;
  form.querySelector('[data-ride-base]').textContent = money(base);
  form.querySelector('[data-mile-charge]').textContent = money(mileCharge);
  form.querySelector('[data-minute-charge]').textContent = money(minuteCharge);
  form.querySelector('[data-ride-total]').textContent = money(total);
  return { base, miles, minutes, mileCharge, minuteCharge, surcharge: 0, total, shortTripBase: miles < 5 };
}

document.querySelectorAll('[data-booking-form]').forEach((form) => {
  const calculator = form.dataset.service === 'package' ? calculatePackage : calculateRide;
  form.addEventListener('input', () => calculator(form));
  calculator(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(form));
    const quote = calculator(form);
    const order = { id: makeId(), service: form.dataset.service, status: 'Requested', createdAt: new Date().toLocaleString(), accountId: currentUser()?.id || null, ...fields, ...quote };
    const orders = readOrders(); orders.unshift(order); saveOrders(orders);
    try {
      const client = await hhtSupabaseReady;
      const { data: { user } } = await client.auth.getUser();
      if (user) await client.from('orders').upsert({ id: order.id, user_id: user.id, service: order.service, status: order.status, total: order.total, payload: order });
    } catch (error) { console.warn('Cloud booking backup unavailable.', error); }
    window.location.href = `receipt.html?id=${encodeURIComponent(order.id)}`;
  });
});

function orderDetails(order) { return `<div class="detail-list"><div><span>Service</span><strong>${order.service}</strong></div><div><span>Status</span><strong><i class="status-pill">${order.status}</i></strong></div><div><span>Pickup</span><strong>${order.pickup}</strong></div><div><span>Delivery</span><strong>${order.delivery}</strong></div><div><span>Customer</span><strong>${order.customerName}</strong></div><div><span>Phone</span><strong>${order.phone}</strong></div></div>`; }

const trackingForm = document.querySelector('[data-tracking-form]');
if (trackingForm) trackingForm.addEventListener('submit', (event) => { event.preventDefault(); const q = new FormData(trackingForm).get('lookup').trim().toLowerCase(); const matches = readOrders().filter(o => o.id.toLowerCase() === q || o.phone.replace(/\D/g, '') === q.replace(/\D/g, '')); const result = document.querySelector('[data-tracking-result]'); result.innerHTML = matches.length ? matches.map(o => `<article class="result-card"><h2>${o.id}</h2>${orderDetails(o)}<a class="button button-secondary" href="receipt.html?id=${encodeURIComponent(o.id)}">View receipt</a></article>`).join('') : '<p>No order was found. Check the receipt number or phone number and try again.</p>'; });

const receipt = document.querySelector('[data-receipt]');
if (receipt) { const id = new URLSearchParams(location.search).get('id'); const order = readOrders().find(o => o.id === id); receipt.innerHTML = order ? `<p class="eyebrow">Hustle Hall Transport</p><h1>Digital receipt</h1><p class="receipt-id">${order.id}</p><p>Created ${order.createdAt}</p><hr>${orderDetails(order)}<hr>${order.service === 'package' ? `<div class="receipt-row"><span>${order.size} package</span><strong>${money(order.base)}</strong></div><div class="receipt-row"><span>Distance surcharge</span><strong>${money(order.surcharge)}</strong></div><div class="receipt-row"><span>Distance</span><strong>${order.miles} miles</strong></div><div class="receipt-row receipt-total"><span>Total</span><strong>${money(order.total)}</strong></div>` : `<div class="receipt-row"><span>Base fare</span><strong>${money(order.base)}</strong></div><div class="receipt-row"><span>Mileage (${order.miles} miles)</span><strong>${money(order.mileCharge)}</strong></div><div class="receipt-row"><span>Time (${order.minutes} minutes)</span><strong>${money(order.minuteCharge)}</strong></div><div class="receipt-row receipt-total"><span>Total</span><strong>${money(order.total)}</strong></div>`}<hr><p><strong>Hustle Hard. Deliver Smart.</strong><br>239-800-1380<br>Powered by ALLMOVINGPARTS LLC</p>` : '<h1>Receipt not found</h1><p>This receipt is not available in this browser.</p>'; }

function renderAdmin() { const orders = readOrders(); const body = document.querySelector('[data-admin-orders]'); if (!body) return; const delivered = orders.filter(o => ['Delivered','Completed'].includes(o.status)); document.querySelector('[data-admin-stats]').innerHTML = `<article class="stat-card"><span>Total requests</span><strong>${orders.length}</strong></article><article class="stat-card"><span>Active requests</span><strong>${orders.filter(o => !['Delivered','Completed','Rejected','Cancelled'].includes(o.status)).length}</strong></article><article class="stat-card"><span>Delivered revenue</span><strong>${money(delivered.reduce((sum,o) => sum + Number(o.total || 0), 0))}</strong></article>`; body.innerHTML = orders.length ? orders.map(o => `<tr><td><a href="receipt.html?id=${encodeURIComponent(o.id)}">${o.id}</a></td><td>${o.customerName}<br><small>${o.phone}</small></td><td>${o.service}</td><td>${o.total ? money(o.total) : 'TBD'}</td><td><select data-status="${o.id}">${statuses.map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td><td><a href="receipt.html?id=${encodeURIComponent(o.id)}">Receipt</a></td></tr>`).join('') : '<tr><td colspan="6">No requests yet.</td></tr>'; body.querySelectorAll('[data-status]').forEach(el => el.addEventListener('change', async () => { const nextStatus = el.value; const list=readOrders(); const item=list.find(o=>o.id===el.dataset.status); if (item) { item.status=nextStatus; saveOrders(list); } try { const client = await hhtSupabaseReady; const { error } = await client.from('orders').update({ status: nextStatus }).eq('id', el.dataset.status); if (error) throw error; } catch (error) { console.warn('Cloud status update unavailable.', error); } renderAdmin(); })); }
renderAdmin();
document.querySelector('[data-export]')?.addEventListener('click', () => { const orders = readOrders(); const keys = ['id','createdAt','service','customerName','phone','pickup','delivery','status','total']; const csv=[keys.join(','),...orders.map(o=>keys.map(k=>`"${String(o[k]??'').replaceAll('"','""')}"`).join(','))].join('\n'); const link=document.createElement('a'); link.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); link.download='hustle-hall-orders.csv'; link.click(); URL.revokeObjectURL(link.href); });

const driverOrders = document.querySelector('[data-driver-orders]');
if (driverOrders) { const orders = readOrders(); driverOrders.innerHTML = orders.length ? orders.map(o => `<article class="driver-card"><div><h2>${o.id} <i class="status-pill">${o.status}</i></h2><p><strong>Pickup:</strong> ${o.pickup}</p><p><strong>Delivery:</strong> ${o.delivery}</p><p><strong>Customer:</strong> ${o.customerName} · ${o.phone}</p></div><div><a class="button button-secondary" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(o.pickup)}&destination=${encodeURIComponent(o.delivery)}">Navigate</a></div></article>`).join('') : '<p>No requests available in this browser yet.</p>'; }
// OpenStreetMap address suggestions and OSRM driving-route estimates for the local MVP.
let lastGeocodeRequest = 0;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function geocodeAddress(query) {
  const pause = Math.max(0, 1100 - (Date.now() - lastGeocodeRequest));
  if (pause) await delay(pause);
  lastGeocodeRequest = Date.now();
  const endpoint = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=us&q=${encodeURIComponent(query)}`;
  const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Address search is unavailable.');
  return response.json();
}

function drawRoute(form, origin, destination, coordinates) {
  const mapElement = form.querySelector('[data-route-map]');
  if (!mapElement || !window.L) return;
  if (!mapElement._map) {
    mapElement._map = L.map(mapElement, { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(mapElement._map);
  }
  const map = mapElement._map;
  if (mapElement._route) map.removeLayer(mapElement._route);
  if (mapElement._markers) mapElement._markers.forEach((marker) => map.removeLayer(marker));
  const points = coordinates.map(([longitude, latitude]) => [latitude, longitude]);
  mapElement._route = L.polyline(points, { color: '#e82d7c', weight: 5 }).addTo(map);
  mapElement._markers = [L.marker([origin.dataset.lat, origin.dataset.lon]).addTo(map), L.marker([destination.dataset.lat, destination.dataset.lon]).addTo(map)];
  map.fitBounds(mapElement._route.getBounds(), { padding: [24, 24] });
}

async function calculateRoute(form) {
  const [origin, destination] = form.querySelectorAll('[data-address]');
  const status = form.querySelector('[data-route-status]');
  if (!origin.value.trim() || !destination.value.trim()) { status.textContent = 'Enter both addresses first.'; return; }
  try {
    status.textContent = 'Finding the best driving route…';
    for (const input of [origin, destination]) {
      if (!input.dataset.lat) {
        const [place] = await geocodeAddress(input.value);
        if (!place) throw new Error('We could not find one of those addresses.');
        input.value = place.display_name;
        input.dataset.lat = place.lat;
        input.dataset.lon = place.lon;
      }
    }
    const endpoint = `https://router.project-osrm.org/route/v1/driving/${origin.dataset.lon},${origin.dataset.lat};${destination.dataset.lon},${destination.dataset.lat}?overview=full&geometries=geojson`;
    const response = await fetch(endpoint);
    const routeData = await response.json();
    if (!response.ok || routeData.code !== 'Ok' || !routeData.routes?.[0]) throw new Error('A driving route was not found.');
    const route = routeData.routes[0];
    form.elements.miles.value = (route.distance / 1609.344).toFixed(1);
    if (form.elements.minutes) form.elements.minutes.value = Math.max(1, Math.round(route.duration / 60));
    (form.dataset.service === 'package' ? calculatePackage : calculateRide)(form);
    status.textContent = `${form.elements.miles.value} miles${form.elements.minutes ? ` · ${form.elements.minutes.value} minutes` : ''} estimated`;
    drawRoute(form, origin, destination, route.geometry.coordinates);
  } catch (error) { status.textContent = error.message || 'Route calculation is currently unavailable.'; }
}

document.querySelectorAll('[data-booking-form]').forEach((form) => {
  const addressInputs = form.querySelectorAll('[data-address]');
  if (!addressInputs.length) return;
  addressInputs.forEach((input) => {
    const suggestions = document.createElement('div');
    suggestions.className = 'address-suggestions'; suggestions.hidden = true;
    input.parentElement.append(suggestions);
    let timer;
    input.addEventListener('input', () => {
      delete input.dataset.lat; delete input.dataset.lon; clearTimeout(timer);
      const query = input.value.trim();
      if (query.length < 4) { suggestions.hidden = true; return; }
      timer = setTimeout(async () => {
        try {
          const places = await geocodeAddress(query);
          suggestions.innerHTML = places.map((place) => `<button type="button" data-lat="${place.lat}" data-lon="${place.lon}">${place.display_name}</button>`).join('');
          suggestions.hidden = !places.length;
          suggestions.querySelectorAll('button').forEach((choice) => choice.addEventListener('click', () => {
            input.value = choice.textContent; input.dataset.lat = choice.dataset.lat; input.dataset.lon = choice.dataset.lon; suggestions.hidden = true;
            if ([...addressInputs].every((field) => field.dataset.lat)) calculateRoute(form);
          }));
        } catch { suggestions.hidden = true; }
      }, 850);
    });
    input.addEventListener('blur', () => setTimeout(() => { suggestions.hidden = true; }, 180));
  });
  form.querySelector('[data-route-calc]')?.addEventListener('click', () => calculateRoute(form));
});
// Local account demo. Replace with server-side authentication before public launch.
const HHT_USERS = 'hht-users';
const HHT_SESSION = 'hht-session';
// Change this before creating the owner/admin account. It is not secure in a static site.
const HHT_ADMIN_ACCESS_CODE = 'HHT-CHANGE-ME';
const readUsers = () => JSON.parse(localStorage.getItem(HHT_USERS) || '[]');
const saveUsers = (users) => localStorage.setItem(HHT_USERS, JSON.stringify(users));
function currentUser() { try { return JSON.parse(localStorage.getItem(HHT_SESSION) || 'null'); } catch { return null; } }
function setCurrentUser(user) { localStorage.setItem(HHT_SESSION, JSON.stringify(user)); }
async function signOut() {
  try { const client = await hhtSupabaseReady; await client.auth.signOut(); } catch (error) { console.warn(error); }
  localStorage.removeItem(HHT_SESSION);
  window.location.href = 'index.html';
}

function accountNavigation() {
  const nav = document.querySelector('.main-nav');
  if (!nav) return;
  const user = currentUser();
  if (!user) {
    if (!nav.querySelector('a[href="login.html"]')) {
      const login = document.createElement('a');
      login.className = 'account-link'; login.href = 'login.html'; login.textContent = 'Log in';
      nav.append(login);
    }
    if (!nav.querySelector('a[href="signup.html"]')) {
      const signup = document.createElement('a');
      signup.className = 'account-link'; signup.href = 'signup.html'; signup.textContent = 'Sign up';
      nav.append(signup);
    }
  } else {
    nav.querySelectorAll('a[href="login.html"], a[href="signup.html"]').forEach((link) => link.remove());
    const account = document.createElement('a');
    account.className = 'account-link';
    account.href = user.role === 'admin' ? 'admin.html' : 'portal.html';
    account.textContent = user.role === 'admin' ? 'Admin Dashboard' : `Hi, ${user.name.split(' ')[0]}`;
    nav.append(account);
  }
  if (user) {
    const logout = document.createElement('button');
    logout.className = 'logout-button'; logout.type = 'button'; logout.textContent = 'Log out';
    logout.addEventListener('click', signOut); nav.append(logout);
  }
}

function showAuthMessage(form, message, isError = true) {
  const area = form.querySelector('[data-auth-message]');
  if (!area) return;
  area.textContent = message; area.classList.toggle('is-success', !isError);
}

function initializeAuthPage() {
  const loginForm = document.querySelector('[data-login-form]');
  const signupForm = document.querySelector('[data-signup-form]');
  if (!loginForm || !signupForm) return;
  const tabButtons = document.querySelectorAll('[data-auth-tab]');
  tabButtons.forEach((button) => button.addEventListener('click', () => {
    const signUp = button.dataset.authTab === 'signup';
    signupForm.hidden = !signUp; loginForm.hidden = signUp;
    tabButtons.forEach((tab) => tab.classList.toggle('is-active', tab === button));
  }));
  const next = new URLSearchParams(location.search).get('next') || document.body.dataset.defaultNext || 'index.html';
  loginForm.addEventListener('submit', (event) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(loginForm));
    const user = readUsers().find((item) => item.email === data.email.trim().toLowerCase() && item.password === data.password);
    if (!user) { showAuthMessage(loginForm, 'That email or password does not match an account.'); return; }
    if (next === 'admin.html' && user.role !== 'admin') { showAuthMessage(loginForm, 'This account does not have admin access.'); return; }
    setCurrentUser({ id: user.id, name: user.name, email: user.email, role: user.role }); window.location.href = next;
  });
  signupForm.addEventListener('submit', (event) => {
    event.preventDefault(); const data = Object.fromEntries(new FormData(signupForm)); const email = data.email.trim().toLowerCase();
    if (data.password !== data.confirmPassword) { showAuthMessage(signupForm, 'Your passwords do not match.'); return; }
    if (readUsers().some((user) => user.email === email)) { showAuthMessage(signupForm, 'An account already exists for that email.'); return; }
    const role = data.adminCode === HHT_ADMIN_ACCESS_CODE ? 'admin' : 'customer';
    const user = { id: `HHTU-${Date.now()}`, name: data.name.trim(), email, password: data.password, role };
    saveUsers([...readUsers(), user]); setCurrentUser({ id: user.id, name: user.name, email: user.email, role: user.role });
    showAuthMessage(signupForm, role === 'admin' ? 'Admin account created. Opening the dashboard…' : 'Account created. Opening your account…', false);
    setTimeout(() => { window.location.href = next === 'admin.html' && role !== 'admin' ? 'index.html' : next; }, 500);
  });
}

if (location.pathname.toLowerCase().endsWith('/admin.html') && currentUser()?.role !== 'admin') {
  window.location.replace('auth.html?next=admin.html');
} else {
  accountNavigation(); initializeAuthPage();
}

async function cloudProfile(client, user) {
  const { data, error } = await client.from('profiles').select('full_name, role').eq('id', user.id).single();
  if (error) throw error;
  return { id: user.id, name: data.full_name || user.email, email: user.email, role: data.role };
}

async function syncCloudOrders() {
  try {
    const client = await hhtSupabaseReady;
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;
    const { data, error } = await client.from('orders').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    if (data?.length) {
      const orders = data.map((row) => ({ ...row.payload, id: row.id, status: row.status, total: Number(row.total), createdAt: new Date(row.created_at).toLocaleString() }));
      saveOrders(orders);
    }
  } catch (error) { console.warn('Cloud order sync unavailable.', error); }
}

// Supabase replaces the earlier browser-only sign-in handlers while retaining the local UI.
document.addEventListener('submit', async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || (!form.matches('[data-login-form]') && !form.matches('[data-signup-form]'))) return;
  event.preventDefault(); event.stopImmediatePropagation();
  const data = Object.fromEntries(new FormData(form));
  const next = new URLSearchParams(location.search).get('next') || document.body.dataset.defaultNext || 'index.html';
  try {
    const client = await hhtSupabaseReady;
    if (form.matches('[data-signup-form]')) {
      if (data.password !== data.confirmPassword) { showAuthMessage(form, 'Your passwords do not match.'); return; }
      const { data: result, error } = await client.auth.signUp({ email: data.email.trim(), password: data.password, options: { data: { full_name: data.name.trim() } } });
      if (error) throw error;
      if (!result.session) { showAuthMessage(form, 'Check your email to confirm your new account, then log in.', false); return; }
      const profile = await cloudProfile(client, result.user);
      setCurrentUser(profile);
      showAuthMessage(form, 'Account created. Opening your account…', false);
      setTimeout(() => { window.location.href = next === 'admin.html' && profile.role !== 'admin' ? 'index.html' : next; }, 450);
    } else {
      const { data: result, error } = await client.auth.signInWithPassword({ email: data.email.trim(), password: data.password });
      if (error) throw error;
      const profile = await cloudProfile(client, result.user);
      if (next === 'admin.html' && profile.role !== 'admin') { showAuthMessage(form, 'This account does not have admin access.'); return; }
      const destination = profile.role === 'admin' && next === 'index.html' ? 'admin.html' : next;
      setCurrentUser(profile); window.location.href = destination;
    }
  } catch (error) { showAuthMessage(form, error.message || 'We could not complete that request.'); }
}, true);

syncCloudOrders();

function escapePortalText(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

async function renderCustomerPortal() {
  const container = document.querySelector('[data-portal-orders]');
  if (!container) return;
  const welcome = document.querySelector('[data-portal-welcome]');
  try {
    const client = await hhtSupabaseReady;
    const { data: { user } } = await client.auth.getUser();
    if (!user) { window.location.replace('login.html?next=portal.html'); return; }
    const profile = await cloudProfile(client, user);
    setCurrentUser(profile);
    welcome.textContent = `Welcome back, ${profile.name.split(' ')[0]}. Here are your saved requests.`;
    const { data, error } = await client.from('orders').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    if (error) throw error;
    if (!data?.length) { container.innerHTML = '<p>You have no saved ride or package requests yet.</p>'; return; }
    container.innerHTML = data.map((row) => {
      const order = row.payload || {};
      const label = row.service === 'package' ? 'Package delivery' : 'Ride request';
      const destination = order.delivery || 'Destination unavailable';
      const price = row.total == null ? 'Quote pending' : money(row.total);
      const canCancel = ['Requested', 'Accepted'].includes(row.status);
      return `<article class="portal-order"><div><h3>${label} <i class="status-pill">${escapePortalText(row.status)}</i></h3><p><strong>Order:</strong> ${escapePortalText(row.id)}</p><p><strong>From:</strong> ${escapePortalText(order.pickup)}</p><p><strong>To:</strong> ${escapePortalText(destination)}</p><p><strong>Requested:</strong> ${new Date(row.created_at).toLocaleDateString()}</p></div><div class="portal-order-actions"><strong class="portal-order-total">${price}</strong>${canCancel ? `<button class="button button-danger" type="button" data-cancel-order="${escapePortalText(row.id)}">Cancel request</button>` : ''}</div></article>`;
    }).join('');
    container.querySelectorAll('[data-cancel-order]').forEach((button) => button.addEventListener('click', async () => {
      const orderId = button.dataset.cancelOrder;
      if (!window.confirm('Cancel this request?')) return;
      button.disabled = true;
      try {
        const { error: cancelError } = await client.from('orders').update({ status: 'Cancelled' }).eq('id', orderId).eq('user_id', user.id);
        if (cancelError) throw cancelError;
        const localOrders = readOrders();
        const localOrder = localOrders.find((savedOrder) => savedOrder.id === orderId);
        if (localOrder) { localOrder.status = 'Cancelled'; saveOrders(localOrders); }
        await renderCustomerPortal();
      } catch (cancelError) {
        button.disabled = false;
        window.alert('We could not cancel this request. Please contact Hustle Hall Transport for assistance.');
        console.warn('Cancellation unavailable.', cancelError);
      }
    }));
  } catch (error) {
    welcome.textContent = 'We could not load your account history.';
    container.innerHTML = '<p>Please refresh the page or log in again.</p>';
    console.warn(error);
  }
}

renderCustomerPortal();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((error) => console.warn('Offline app setup failed.', error));
  });
}

function addInstagramFooterLink() {
  let footer = document.querySelector('.site-footer');
  if (!footer) {
    footer = document.createElement('footer');
    footer.className = 'site-footer';
    footer.innerHTML = '<div class="container footer-content"><p>Powered by ALLMOVINGPARTS LLC</p></div>';
    document.body.append(footer);
  }
  const content = footer.querySelector('.footer-content') || footer;
  if (content.querySelector('.footer-instagram')) return;
  const link = document.createElement('a');
  link.className = 'footer-instagram';
  link.href = 'https://instagram.com/HustleHallTransport';
  link.target = '_blank';
  link.rel = 'noopener';
  link.setAttribute('aria-label', 'Follow Hustle Hall Transport on Instagram');
  link.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.3 2h9.4A5.3 5.3 0 0 1 22 7.3v9.4a5.3 5.3 0 0 1-5.3 5.3H7.3A5.3 5.3 0 0 1 2 16.7V7.3A5.3 5.3 0 0 1 7.3 2Zm-.2 2A3.1 3.1 0 0 0 4 7.1v9.8A3.1 3.1 0 0 0 7.1 20h9.8a3.1 3.1 0 0 0 3.1-3.1V7.1A3.1 3.1 0 0 0 16.9 4H7.1Zm9.1 1.5a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6ZM12 6.5A5.5 5.5 0 1 1 6.5 12 5.5 5.5 0 0 1 12 6.5Zm0 2A3.5 3.5 0 1 0 15.5 12 3.5 3.5 0 0 0 12 8.5Z"/></svg><span>@HustleHallTransport</span>';
  content.append(link);
}

addInstagramFooterLink();

document.querySelectorAll('a[href="package-booking.html"]').forEach((link) => {
  link.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) node.nodeValue = node.nodeValue.replace('Send a Package', 'Start a Delivery');
  });
});

document.querySelectorAll('.page-title').forEach((title) => {
  if (title.textContent.trim() === 'Send a package.') title.textContent = 'Start a delivery.';
});

const packageSizeSelect = document.querySelector('select[name="packageSize"]');
if (packageSizeSelect && !document.querySelector('.package-size-guide')) {
  const detailsSection = packageSizeSelect.closest('section');
  const formGrid = detailsSection?.querySelector('.form-grid');
  const descriptionField = document.querySelector('input[name="description"]')?.closest('label');
  detailsSection?.classList.add('package-details-section');
  if (descriptionField && formGrid) {
    descriptionField.classList.add('form-wide');
    formGrid.prepend(descriptionField);
  }
  detailsSection?.insertAdjacentHTML('beforebegin', '<aside class="package-size-guide package-guide-card"><p class="eyebrow">Choose the right size</p><h2>Package size guide</h2><div><span><b>Small — $5</b>All small food deliveries, documents, medications, and other hand-sized items.</span><span><b>Medium — $10</b>Grocery bags, shoeboxes, retail purchases, and medium boxes.</span><span><b>Large — $20</b>Large boxes, multiple bags, and bulky items that fit safely in a standard vehicle.</span><span><b>Extra Large — from $50</b>Appliances, furniture, and other oversized items.</span></div></aside>');
}
