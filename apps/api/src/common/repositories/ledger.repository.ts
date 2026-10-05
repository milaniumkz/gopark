import type { LedgerEntry } from "@gopark/contracts";
import type { CreateLedgerEntryDto } from "../../modules/ledger/dto/create-ledger-entry.dto.js";

export interface LedgerRepository {
  list(): Promise<LedgerEntry[]>;
  listByCompany(companyName: string): Promise<LedgerEntry[]>;
  create(input: CreateLedgerEntryDto): Promise<LedgerEntry>;
}
