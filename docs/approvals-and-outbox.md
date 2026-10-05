# Approvals And Outbox

## Payout approval

- payout starts in `requested`
- approver identity is derived from bootstrap auth headers, not from request body
- finance can approve payouts up to `settings.payoutApprovalThreshold`
- payouts above the threshold require `admin` or `owner`
- approval writes audit
- approval emits outbox event

## Outbox purpose

Outbox events are the correct place for future:

- bank adapter processing
- notification fanout
- BI / reporting synchronization
- webhook retries

## Current bootstrap implementation

- repository-backed outbox with `in-memory` and `prisma` runtime paths
- approval endpoint for payouts
- events for `payment.registered`, `payout.requested`, `payout.approved`
- BullMQ-backed enqueue path when `REDIS_URL` is configured
- dedicated `APP_RUNTIME=worker` outbox consumer runtime
- worker endpoint `POST /workers/outbox/process` now acts as a sweep/queue trigger for pending events
