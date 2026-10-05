import type { OutboxEventItem } from "@gopark/contracts";

export interface OutboxRepository {
  list(): Promise<OutboxEventItem[]>;
  listByCompany(companyName: string): Promise<OutboxEventItem[]>;
  listPending(limit?: number): Promise<OutboxEventItem[]>;
  countPending(): Promise<number>;
  getById(eventId: string): Promise<OutboxEventItem | null>;
  create(input: Omit<OutboxEventItem, "id" | "status" | "createdAt"> & { createdAt?: string }): Promise<OutboxEventItem>;
  markPending(eventId: string): Promise<OutboxEventItem | null>;
  markPublished(eventId: string): Promise<OutboxEventItem | null>;
  markFailed(eventId: string): Promise<OutboxEventItem | null>;
}
