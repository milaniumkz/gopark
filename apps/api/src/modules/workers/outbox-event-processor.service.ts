import { Injectable } from "@nestjs/common";
import { makeOutboxRepository } from "../../common/application/repository.factory.js";
import type { OutboxRepository } from "../../common/repositories/index.js";
import { IntegrationEventsService } from "../integrations/integration-events.service.js";
import { AuditLogService } from "../audit/audit-log.service.js";

@Injectable()
export class OutboxEventProcessorService {
  private readonly repository: OutboxRepository = makeOutboxRepository();

  constructor(
    private readonly integrationEventsService: IntegrationEventsService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async processEvent(eventId: string): Promise<boolean> {
    const event = await this.repository.getById(eventId);
    if (!event || event.status === "published") {
      return false;
    }

    const result = await this.integrationEventsService.handle(event.topic, { ...event.payload, eventId: event.id });
    if (!result.accepted) {
      throw new Error(`Outbox integration handler rejected topic ${event.topic}`);
    }

    await this.repository.markPublished(event.id);
    await this.auditLogService.write("outbox.event.published", "outbox_event", event.id);
    return true;
  }

  async processPendingInline(limit = 100): Promise<string[]> {
    const pending = await this.repository.listPending(limit);
    const processed: string[] = [];

    for (const event of pending) {
      try {
        await this.processEvent(event.id);
        processed.push(event.id);
      } catch (error) {
        await this.markFailed(event.id, error instanceof Error ? error.message : String(error));
      }
    }

    return processed;
  }

  async markFailed(eventId: string, _reason: string): Promise<void> {
    await this.repository.markFailed(eventId);
    await this.auditLogService.write("outbox.event.failed", "outbox_event", eventId);
  }
}
