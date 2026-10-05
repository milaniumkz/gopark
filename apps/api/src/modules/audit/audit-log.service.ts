import { Injectable } from "@nestjs/common";
import { makeAuditRepository } from "../../common/application/repository.factory.js";
import type { AuditRepository, CreateAuditLogInput } from "../../common/repositories/index.js";

@Injectable()
export class AuditLogService {
  private readonly repository: AuditRepository = makeAuditRepository();

  async write(action: string, entityType: string, entityId: string | null, input?: CreateAuditLogInput) {
    return this.repository.create(action, entityType, entityId, input);
  }
}
