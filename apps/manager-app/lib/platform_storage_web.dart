import 'package:web/web.dart' as web;

Future<String?> readStorageValue(String key) async =>
    web.window.localStorage.getItem(key);

Future<void> writeStorageValue(String key, String value) async {
  web.window.localStorage.setItem(key, value);
}

Future<void> removeStorageValue(String key) async {
  web.window.localStorage.removeItem(key);
}
