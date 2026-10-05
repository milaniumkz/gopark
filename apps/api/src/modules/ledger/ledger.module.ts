import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { LedgerController } from "./ledger.controller.js";
import { LedgerService } from "./ledger.service.js";

@Module({
  imports: [AuditModule],
  controllers: [LedgerController],
  providers: [LedgerService],
})
export class LedgerModule {}
