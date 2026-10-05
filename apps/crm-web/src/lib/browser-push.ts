import { initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging";
import { postJson } from "./api";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "AIzaSyBV9tUkpDz6pwvvMM2guI9OuwPllzm5cr0",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "goparkpush.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "goparkpush",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "goparkpush.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "838745336899",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "1:838745336899:web:984cdf2897d3268ec5b8f6",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? "G-MM5QBD33BE",
};

let registered = false;

export async function registerCrmBrowserPush(): Promise<void> {
  if (registered || !("serviceWorker" in navigator) || !("Notification" in window)) {
    return;
  }

  const supported = await isSupported().catch(() => false);
  if (!supported) {
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return;
  }

  const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const app = initializeApp(firebaseConfig);
  const messaging = getMessaging(app);
  const vapidKey = (import.meta.env.VITE_FIREBASE_WEB_VAPID_KEY as string | undefined)?.trim();
  const token = await getToken(messaging, {
    serviceWorkerRegistration: registration,
    ...(vapidKey ? { vapidKey } : {}),
  }).catch(() => null);

  if (!token) {
    return;
  }

  await postJson<{ ok: true }, { token: string; platform: string; app: string }>("mobile/push-tokens", {
    token,
    platform: "web",
    app: "crm",
  });

  onMessage(messaging, (payload) => {
    const notification = payload.notification;
    if (!notification?.title) {
      return;
    }

    new Notification(notification.title, {
      body: notification.body,
      icon: "/favicon.svg",
    });
  });

  registered = true;
}
