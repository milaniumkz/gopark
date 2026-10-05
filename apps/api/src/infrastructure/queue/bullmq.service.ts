import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { getConfig } from "../../config.js";

export interface OutboxQueueJobData {
  eventId: string;
}

const OUTBOX_QUEUE_NAME = "gopark-outbox";
const OUTBOX_JOB_NAME = "publish";
const OUTBOX_JOB_ATTEMPTS = 5;
const OUTBOX_JOB_BACKOFF_MS = 5_000;

let queueConnection: Redis | null = null;
let queue: Queue<OutboxQueueJobData> | null = null;

export class BullmqService {
  get isReady(): boolean {
    return Boolean(getConfig().redisUrl);
  }

  async enqueueOutboxEvent(eventId: string): Promise<boolean> {
    if (!this.isReady) {
      return false;
    }

    await this.getQueue().add(
      OUTBOX_JOB_NAME,
      { eventId },
      {
        jobId: eventId,
        attempts: OUTBOX_JOB_ATTEMPTS,
        backoff: {
          type: "exponential",
          delay: OUTBOX_JOB_BACKOFF_MS,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    return true;
  }

  async enqueueOutboxEvents(eventIds: string[]): Promise<string[]> {
    if (!this.isReady || eventIds.length === 0) {
      return [];
    }

    const queue = this.getQueue();
    await queue.addBulk(eventIds.map((eventId) => ({
      name: OUTBOX_JOB_NAME,
      data: { eventId },
      opts: {
        jobId: eventId,
        attempts: OUTBOX_JOB_ATTEMPTS,
        backoff: {
          type: "exponential",
          delay: OUTBOX_JOB_BACKOFF_MS,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    })));

    return eventIds;
  }

  createOutboxWorker(
    processor: (eventId: string) => Promise<void>,
    concurrency = 4,
  ): Worker<OutboxQueueJobData> {
    const redisUrl = getRequiredRedisUrl();

    return new Worker<OutboxQueueJobData>(
      OUTBOX_QUEUE_NAME,
      async (job) => {
        await processor(job.data.eventId);
      },
      {
        connection: new Redis(redisUrl, {
          maxRetriesPerRequest: null,
          lazyConnect: false,
        }),
        concurrency,
      },
    );
  }

  async close(): Promise<void> {
    if (queue) {
      await queue.close();
      queue = null;
    }

    if (queueConnection) {
      await queueConnection.quit();
      queueConnection = null;
    }
  }

  private getQueue(): Queue<OutboxQueueJobData> {
    if (!queueConnection) {
      queueConnection = new Redis(getRequiredRedisUrl(), {
        maxRetriesPerRequest: null,
        lazyConnect: false,
      });
    }

    if (!queue) {
      queue = new Queue<OutboxQueueJobData>(OUTBOX_QUEUE_NAME, {
        connection: queueConnection,
      });
    }

    return queue;
  }
}

function getRequiredRedisUrl(): string {
  const redisUrl = getConfig().redisUrl;
  if (!redisUrl) {
    throw new Error("Missing REDIS_URL for BullMQ runtime");
  }

  return redisUrl;
}
