import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { OutboxEventItem } from "@gopark/contracts";
import { makeOutboxRepository } from "../../common/application/repository.factory.js";
import type { OutboxRepository } from "../../common/repositories/index.js";
import { OutboxDispatchService } from "../workers/outbox-dispatch.service.js";

@Injectable()
export class OutboxService {
  private readonly repository: OutboxRepository = makeOutboxRepository();

  constructor(private readonly outboxDispatchService: OutboxDispatchService) {}

  async list(): Promise<OutboxEventItem[]> {
    return this.repository.list();
  }

  async listByCompany(companyName: string): Promise<OutboxEventItem[]> {
    return this.repository.listByCompany(companyName);
  }

  async create(topic: string, aggregateType: string, aggregateId: string, payload: Record<string, unknown>, dispatchAt?: string | null) {
    const event = await this.repository.create({
      topic,
      aggregateType,
      aggregateId,
      payload,
      createdAt: dispatchAt ?? undefined,
    });

    if (!dispatchAt || new Date(dispatchAt).getTime() <= Date.now()) {
      try {
        await this.outboxDispatchService.enqueueEvent(event.id);
      } catch (error) {
        console.warn(
          `[gopark-api] failed to enqueue outbox event ${event.id}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return event;
  }

  async retry(eventId: string, companyName?: string | null) {
    if (companyName) {
      const allowed = await this.repository.listByCompany(companyName);
      if (!allowed.some((item) => item.id === eventId)) {
        throw new NotFoundException("Событие не найдено.");
      }
    }

    const current = await this.repository.getById(eventId);
    if (!current) {
      throw new NotFoundException("Событие не найдено.");
    }

    if (current.status === "published") {
      throw new BadRequestException("Отправленное событие не требует повторной постановки.");
    }

    const updated = await this.repository.markPending(eventId);
    if (!updated) {
      throw new NotFoundException("Событие не найдено.");
    }

    try {
      await this.outboxDispatchService.enqueueEvent(eventId);
    } catch (error) {
      console.warn(
        `[gopark-api] failed to re-enqueue outbox event ${eventId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return updated;
  }
}
