import { Injectable } from "@nestjs/common";
import { BullmqService } from "../../infrastructure/queue/bullmq.service.js";
import { makeOutboxRepository } from "../../common/application/repository.factory.js";
import type { OutboxRepository } from "../../common/repositories/index.js";

@Injectable()
export class OutboxDispatchService {
  private readonly repository: OutboxRepository = makeOutboxRepository();
  private readonly bullmqService = new BullmqService();

  get queueReady(): boolean {
    return this.bullmqService.isReady;
  }

  async enqueueEvent(eventId: string): Promise<boolean> {
    return this.bullmqService.enqueueOutboxEvent(eventId);
  }

  async enqueuePendingEvents(limit = 100): Promise<string[]> {
    const pending = await this.repository.listPending(limit);
    return this.bullmqService.enqueueOutboxEvents(pending.map((event) => event.id));
  }

  async close(): Promise<void> {
    await this.bullmqService.close();
  }
}
