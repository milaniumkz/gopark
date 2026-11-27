"""Validate Android client configuration without displaying its values."""
import json
import pathlib
import sys

config = json.loads(pathlib.Path(sys.argv[1]).read_text())
assert "private_key" not in config, "A service account must never be embedded in an APK"
assert config.get("project_info", {}).get("project_id"), "Firebase project is missing"
clients = [c for c in config.get("client", []) if c.get("client_info", {}).get("android_client_info", {}).get("package_name") == sys.argv[2]]
assert len(clients) == 1, "Expected exactly one matching Android client"
assert clients[0].get("client_info", {}).get("mobilesdk_app_id"), "Firebase app ID is missing"
assert clients[0].get("api_key"), "Firebase Android client key is missing"
print("Firebase Android client validated for the application package.")
