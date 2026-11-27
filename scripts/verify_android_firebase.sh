#!/usr/bin/env bash
set -euo pipefail
: "${ANDROID_HOME:?}"
aapt=$(find "$ANDROID_HOME/build-tools" -name aapt -type f | sort -V | tail -1)
resources=$(mktemp)
trap 'rm -f "$resources"' EXIT
"$aapt" dump resources "$1" > "$resources"
for name in google_app_id gcm_defaultSenderId google_api_key; do
  grep -q "$name" "$resources" || { echo "APK is missing required Firebase resource: $name"; exit 1; }
done
echo 'APK contains the required Firebase Android client resources.'
