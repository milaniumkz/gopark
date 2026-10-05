import type { AuditLogItem } from "@gopark/contracts";

export interface CreateAuditLogInput {
  actorUserId?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
}

export interface AuditRepository {
  list(): Promise<AuditLogItem[]>;
  listByCompany(companyName: string): Promise<AuditLogItem[]>;
  create(action: string, entityType: string, entityId: string | null, input?: CreateAuditLogInput): Promise<AuditLogItem>;
}
