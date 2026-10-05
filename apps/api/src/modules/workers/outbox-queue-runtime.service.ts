import { Injectable } from "@nestjs/common";
import type { Worker } from "bullmq";
import type { OutboxQueueJobData } from "../../infrastructure/queue/bullmq.service.js";
import { BullmqService } from "../../infrastructure/queue/bullmq.service.js";
import { OutboxDispatchService } from "./outbox-dispatch.service.js";
import { OutboxEventProcessorService } from "./outbox-event-processor.service.js";

const SWEEP_INTERVAL_MS = 60_000;
const SWEEP_BATCH_SIZE = 100;
const WORKER_CONCURRENCY = 4;

@Injectable()
export class OutboxQueueRuntimeService {
  private readonly bullmqService = new BullmqService();
  private worker: Worker<OutboxQueueJobData> | null = null;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly outboxDispatchService: OutboxDispatchService,
    private readonly outboxEventProcessorService: OutboxEventProcessorService,
  ) {}

  async start(): Promise<void> {
    if (!this.bullmqService.isReady) {
      throw new Error("BullMQ runtime requires REDIS_URL");
    }

    if (!this.worker) {
      this.worker = this.bullmqService.createOutboxWorker(
        async (eventId) => {
          await this.outboxEventProcessorService.processEvent(eventId);
        },
        WORKER_CONCURRENCY,
      );

      this.worker.on("failed", async (job, error) => {
        if (!job) {
          return;
        }

        const maxAttempts = job.opts.attempts ?? 1;
        const isTerminal = job.attemptsMade >= maxAttempts;
        if (isTerminal) {
          await this.outboxEventProcessorService.markFailed(job.data.eventId, error.message);
        }
      });
    }

    await this.outboxDispatchService.enqueuePendingEvents(SWEEP_BATCH_SIZE);
    this.startSweepLoop();
  }

  async stop(): Promise<void> {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }

    if (this.worker) {
      await this.worker.close();
      this.worker = null;
    }

    await this.outboxDispatchService.close();
  }

  private startSweepLoop(): void {
    if (this.sweepTimer) {
      return;
    }

    this.sweepTimer = setInterval(() => {
      void this.outboxDispatchService.enqueuePendingEvents(SWEEP_BATCH_SIZE);
    }, SWEEP_INTERVAL_MS);
  }
}
