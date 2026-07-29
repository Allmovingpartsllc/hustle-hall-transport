const HHT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCLEFTWccfqcvghddMyQGOIP7SXxo-zbgo',
  authDomain: 'hustle-hall-transport.firebaseapp.com',
  projectId: 'hustle-hall-transport',
  storageBucket: 'hustle-hall-transport.firebasestorage.app',
  messagingSenderId: '432217667968',
  appId: '1:432217667968:web:42c2037f3a04cf0a05e965'
};
const HHT_VAPID_KEY = 'BFA2_HaG1tT_dALxhybpK2WvVI4Q3Ha-c5Mp8QQFjIW3zwTwufM2ZKoh2kgNLlSmfvJ7QXvi2CFpURmXVOHkeFI';

function loadFirebaseScript(source) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${source}"]`);
    if (existing) { existing.addEventListener('load', resolve, { once: true }); return; }
    const script = document.createElement('script');
    script.src = source;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Phone notifications could not load.'));
    document.head.append(script);
  });
}

async function enableHustleHallPush(button, message) {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    message.textContent = 'Phone notifications are not supported in this browser.';
    return;
  }
  button.disabled = true;
  message.textContent = 'Connecting phone notifications...';
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notifications were not allowed.');
    await loadFirebaseScript('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
    await loadFirebaseScript('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');
    if (!firebase.apps.length) firebase.initializeApp(HHT_FIREBASE_CONFIG);
    const registration = await navigator.serviceWorker.ready;
    const token = await firebase.messaging().getToken({ vapidKey: HHT_VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) throw new Error('A phone notification token was not created.');
    const client = await hhtSupabaseReady;
    const { data: { user } } = await client.auth.getUser();
    if (!user) throw new Error('Please log in as an admin first.');
    const { error } = await client.from('push_subscriptions').upsert({ user_id: user.id, token, device_name: navigator.userAgent.slice(0, 180) }, { onConflict: 'token' });
    if (error) throw error;
    button.textContent = 'Phone notifications enabled';
    message.textContent = 'You will now receive alerts for new bookings, cancellations, and status updates.';
  } catch (error) {
    console.warn('Push notification setup failed.', error);
    message.textContent = error.message || 'We could not enable phone notifications.';
    button.disabled = false;
  }
}

async function addPushNotificationControl() {
  const note = document.querySelector('.dashboard-note');
  if (!note || document.querySelector('[data-enable-push]')) return;
  const client = await hhtSupabaseReady;
  const { data: { user } } = await client.auth.getUser();
  if (!user) return;
  const profile = await cloudProfile(client, user);
  if (profile.role !== 'admin') return;
  const control = document.createElement('section');
  control.className = 'dashboard-note push-control';
  control.innerHTML = '<strong>Phone alerts</strong><p>Receive phone notifications for new bookings, cancellations, and trip updates.</p><button class="button button-primary" type="button" data-enable-push>Enable phone notifications</button><p data-push-message aria-live="polite"></p>';
  note.insertAdjacentElement('afterend', control);
  control.querySelector('[data-enable-push]').addEventListener('click', (event) => enableHustleHallPush(event.currentTarget, control.querySelector('[data-push-message]')));
}

addPushNotificationControl().catch((error) => console.warn('Push controls unavailable.', error));
