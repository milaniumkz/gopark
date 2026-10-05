import { Module } from "@nestjs/common";
import { ContractsController } from "./contracts.controller.js";
import { ContractsService } from "./contracts.service.js";
import { FinanceWorkflowModule } from "../finance-workflow/finance-workflow.module.js";
import { AuditModule } from "../audit/audit.module.js";

@Module({
  imports: [FinanceWorkflowModule, AuditModule],
  controllers: [ContractsController],
  providers: [ContractsService],
})
export class ContractsModule {}
