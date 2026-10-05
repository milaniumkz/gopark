# Workers

## Current worker

- `POST /workers/outbox/process`
- `APP_RUNTIME=worker`
- Cloud Run service `gopark-outbox-worker`

## What it does

1. API writes outbox rows in PostgreSQL
2. when `REDIS_URL` is configured and the API runtime has private network access to Redis, API also enqueues BullMQ jobs for each new outbox event
3. `APP_RUNTIME=worker` starts a dedicated BullMQ-backed outbox consumer
4. worker routes each queued event to the integration event handler
5. on success, worker marks the outbox row as published and writes audit entries
6. on terminal retry exhaustion, worker marks the row as failed
7. `POST /workers/outbox/process` now works as a sweep endpoint:
   - if Redis/BullMQ is ready, it queues pending events
   - otherwise it falls back to inline processing for local runtime

## Why this exists now

This is now the production async processing path.
It keeps PostgreSQL outbox rows as the source of truth and moves delivery/retry behavior to Redis + BullMQ.

## Current production shape

- Redis: Memorystore instance `gopark-redis`
- Redis policy: `maxmemory-policy=noeviction`
- Worker networking: Serverless VPC connector `gopark-serverless-vpc`
- Worker scaling: `min-instances=1`, `max-instances=1`, `cpu-throttling=false`

Later it should move to:

- retry policies
- dead-letter queue
- provider-specific handlers
