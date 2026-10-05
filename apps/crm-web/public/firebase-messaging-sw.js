importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyBV9tUkpDz6pwvvMM2guI9OuwPllzm5cr0",
  authDomain: "goparkpush.firebaseapp.com",
  projectId: "goparkpush",
  storageBucket: "goparkpush.firebasestorage.app",
  messagingSenderId: "838745336899",
  appId: "1:838745336899:web:984cdf2897d3268ec5b8f6",
  measurementId: "G-MM5QBD33BE",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  self.registration.showNotification(notification.title || "GoPark", {
    body: notification.body || "Новое уведомление",
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    data: payload.data || {},
  });
});
