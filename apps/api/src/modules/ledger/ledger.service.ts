import { Injectable } from "@nestjs/common";
import type { LedgerEntry } from "@gopark/contracts";
import { makeLedgerRepository } from "../../common/application/repository.factory.js";
import type { LedgerRepository } from "../../common/repositories/index.js";
import type { CreateLedgerEntryDto } from "./dto/create-ledger-entry.dto.js";
import { AuditLogService } from "../audit/audit-log.service.js";

@Injectable()
export class LedgerService {
  private readonly repository: LedgerRepository = makeLedgerRepository();

  constructor(private readonly auditLogService: AuditLogService) {}

  async list(): Promise<LedgerEntry[]> {
    return this.repository.list();
  }

  async listByCompany(companyName: string): Promise<LedgerEntry[]> {
    return this.repository.listByCompany(companyName);
  }

  async create(input: CreateLedgerEntryDto): Promise<LedgerEntry> {
    const entry = await this.repository.create(input);
    await this.auditLogService.write("ledger.entry.created", "ledger_entry", entry.id);
    return entry;
  }
}
