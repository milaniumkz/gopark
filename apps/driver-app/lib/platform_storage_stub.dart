final Map<String, String> _memoryStorage = <String, String>{};

Future<String?> readStorageValue(String key) async => _memoryStorage[key];

Future<void> writeStorageValue(String key, String value) async {
  _memoryStorage[key] = value;
}

Future<void> removeStorageValue(String key) async {
  _memoryStorage.remove(key);
}
