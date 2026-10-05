import 'package:shared_preferences/shared_preferences.dart';

Future<String?> readStorageValue(String key) async {
  final preferences = await SharedPreferences.getInstance();
  return preferences.getString(key);
}

Future<void> writeStorageValue(String key, String value) async {
  final preferences = await SharedPreferences.getInstance();
  await preferences.setString(key, value);
}

Future<void> removeStorageValue(String key) async {
  final preferences = await SharedPreferences.getInstance();
  await preferences.remove(key);
}
