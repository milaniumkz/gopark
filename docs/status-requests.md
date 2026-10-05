# Status Requests

## Catalog

Allowed status request types:

- `day_off`
- `vacation`
- `force_majeure`

## Current usage

- settings surface exposes allowed status request types
- driver mobile flow creates status requests using the same catalog
- backend validates created driver status requests against `SettingsOverview.allowedStatusRequestTypes`
- create flow now validates period format:
  - `YYYY-MM-DD`
  - or `YYYY-MM-DD .. YYYY-MM-DD`
- create flow rejects overlaps with existing `pending` or `approved` requests for the same driver
- approvals workflow now exists for `pending` requests:
  - `POST /api/approvals/status-requests/:requestId/approve`
  - `POST /api/approvals/status-requests/:requestId/reject`
- only `pending` requests can be reviewed
- approve is rejected if the request overlaps an already approved period for the same driver
- seed and bootstrap data should stay aligned with the shared contract catalog
- approved status requests now affect read-side debt policy:
  - obligations on covered dates do not count into `due today`
  - covered obligations shift to a later effective due date in `next payment`
  - covered dates do not count into `overdue debt`
- approved covered obligations are now also exposed in payment schedule as `deferred`
- approved status requests now also affect effective current driver status in read-side summaries and dashboard counters
- approve workflow now also writes an explicit deferral marker onto covered open obligations:
  - `deferred_until`
  - `deferred_by_status_request_id`
- read-side debt and payment-schedule logic use these stored markers in addition to approved request periods
- this is now a hybrid model:
  - effective status still comes from approved status requests
  - obligation deferral is now persisted in the financial model
  - read-side schedule now uses the stored deferral marker to shift effective due dates forward
  - full materialized schedule rewrite is still not implemented
