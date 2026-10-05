import { Module } from "@nestjs/common";
import { ApprovalsController } from "./approvals.controller.js";
import { ApprovalsService } from "./approvals.service.js";
import { AuditModule } from "../audit/audit.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { OutboxModule } from "../outbox/outbox.module.js";

@Module({
  imports: [AuditModule, NotificationsModule, OutboxModule],
  controllers: [ApprovalsController],
  providers: [ApprovalsService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
