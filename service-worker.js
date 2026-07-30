importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCLEFTWccfqcvghddMyQGOIP7SXxo-zbgo',
  authDomain: 'hustle-hall-transport.firebaseapp.com',
  projectId: 'hustle-hall-transport',
  storageBucket: 'hustle-hall-transport.firebasestorage.app',
  messagingSenderId: '432217667968',
  appId: '1:432217667968:web:42c2037f3a04cf0a05e965'
});

firebase.messaging().onBackgroundMessage((payload) => {
  self.registration.showNotification(payload.notification?.title || 'Hustle Hall Transport', {
    body: payload.notification?.body || 'You have a new update.',
    icon: './icon-192.png',
    data: { url: 'admin.html' }
  });
});

const CACHE_NAME = 'hustle-hall-v26';
const APP_FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './push.js',
  './manifest.webmanifest',
  './logo.JPG',
  './logo.png',
  './icon-192.png',
  './icon-512.png',
  './login.html',
  './signup.html',
  './portal.html',
  './ride-booking.html',
  './package-booking.html',
  './tracking.html',
  './receipt.html',
  './admin.html',
  './admin-login.html',
  './driver.html',
  './auth.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
