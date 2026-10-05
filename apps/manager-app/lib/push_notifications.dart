import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

@pragma('vm:entry-point')
Future<void> goparkFirebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (_) {
    // Firebase is optional until google-services.json is installed.
  }
}

class ManagerPushNotifications {
  ManagerPushNotifications._();

  static bool _initialized = false;

  static Future<String?> initAndGetToken() async {
    if (kIsWeb) {
      return null;
    }

    try {
      if (!_initialized) {
        await Firebase.initializeApp();
        FirebaseMessaging.onBackgroundMessage(
          goparkFirebaseMessagingBackgroundHandler,
        );
        await FirebaseMessaging.instance.requestPermission(
          alert: true,
          badge: true,
          sound: true,
        );
        _initialized = true;
      }

      return await FirebaseMessaging.instance.getToken();
    } catch (error) {
      debugPrint('GoPark manager push init failed: $error');
      return null;
    }
  }

  static void listenTokenRefresh(Future<void> Function(String token) onToken) {
    if (kIsWeb || !_initialized) {
      return;
    }

    FirebaseMessaging.instance.onTokenRefresh.listen((token) {
      if (token.trim().isNotEmpty) {
        onToken(token);
      }
    });
  }
}
