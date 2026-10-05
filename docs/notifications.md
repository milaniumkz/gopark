# Notifications

## Catalog

Current notification templates:

- `payout_requested`
- `payout_approved`

Current notification channels:

- `push`
- `sms`
- `in_app`

## Current usage

- `payout_requested`
  sent when a driver creates a payout request
- `payout_approved`
  sent when finance/admin approves a payout request
- backend validates notification channel usage against `SettingsOverview.notificationChannels`

## Notes

- Template codes are defined in shared contracts and should not be introduced as ad-hoc strings in workflow services.
- Channel and template usage should stay aligned between seed data, workflow services, and repository mappings.
- Android apps declare `POST_NOTIFICATIONS` for Android 13+.
- Closed-app push delivery still requires full Firebase Cloud Messaging wiring:
  - add `firebase_core` and `firebase_messaging` to driver/manager Flutter apps
  - add each app's `google-services.json`
  - request notification permission in the app and register the FCM device token with the API after login
  - store device tokens on the backend
  - send `notification.dispatch` / `manager_alert.dispatch` through FCM using a configured Firebase service account
- Until that FCM chain exists, the app only receives in-app/API notifications while it is opened and polling data.
