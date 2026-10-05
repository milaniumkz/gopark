import { Injectable } from "@nestjs/common";
import type { OutboxProcessResult } from "@gopark/contracts";
import { OutboxDispatchService } from "./outbox-dispatch.service.js";
import { OutboxEventProcessorService } from "./outbox-event-processor.service.js";

@Injectable()
export class OutboxWorkerService {
  constructor(
    private readonly outboxDispatchService: OutboxDispatchService,
    private readonly outboxEventProcessorService: OutboxEventProcessorService,
  ) {}

  async processPendingEvents(): Promise<OutboxProcessResult> {
    if (this.outboxDispatchService.queueReady) {
      const queued = await this.outboxDispatchService.enqueuePendingEvents();

      return {
        mode: "queued",
        processedCount: 0,
        processed: [],
        queuedCount: queued.length,
        queued,
      };
    }

    const processed = await this.outboxEventProcessorService.processPendingInline();

    return {
      mode: "inline",
      processedCount: processed.length,
      processed,
      queuedCount: 0,
      queued: [],
    };
  }
}
