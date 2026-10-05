import { Module } from "@nestjs/common";
import { FinanceWorkflowService } from "./finance-workflow.service.js";
import { AuditModule } from "../audit/audit.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";

@Module({
  imports: [AuditModule, NotificationsModule, OutboxModule],
  providers: [FinanceWorkflowService],
  exports: [FinanceWorkflowService],
})
export class FinanceWorkflowModule {}
