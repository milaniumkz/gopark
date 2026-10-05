import { Injectable } from "@nestjs/common";
import type { AuditLogItem } from "@gopark/contracts";
import { makeAuditRepository } from "../../common/application/repository.factory.js";
import type { AuditRepository } from "../../common/repositories/index.js";

@Injectable()
export class AuditService {
  private readonly repository: AuditRepository = makeAuditRepository();

  async list(): Promise<AuditLogItem[]> {
    return this.repository.list();
  }

  async listByCompany(companyName: string): Promise<AuditLogItem[]> {
    return this.repository.listByCompany(companyName);
  }
}
