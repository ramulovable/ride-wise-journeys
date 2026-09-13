importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const DEFAULT_CONFIG = {
  apiKey: 'AIzaSyBamK-2kcrdWsYhReWOp1Gybqs8SD1j0cI',
  projectId: 'shahin-travels',
  appId: '1:1094301147309:web:5519ecad0b83d784846624',
  messagingSenderId: '1094301147309',
};

const query = Object.fromEntries(new URL(self.location).searchParams);
firebase.initializeApp({
  apiKey: query.apiKey || DEFAULT_CONFIG.apiKey,
  projectId: query.projectId || DEFAULT_CONFIG.projectId,
  appId: query.appId || DEFAULT_CONFIG.appId,
  messagingSenderId: query.messagingSenderId || DEFAULT_CONFIG.messagingSenderId,
});
firebase.messaging();

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = event.notification?.data?.path || '/rider';
  event.waitUntil(clients.openWindow(path));
});
