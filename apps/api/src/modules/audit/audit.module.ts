import { Module } from "@nestjs/common";
import { AuditController } from "./audit.controller.js";
import { AuditService } from "./audit.service.js";
import { AuditLogService } from "./audit-log.service.js";

@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditLogService],
  exports: [AuditLogService],
})
export class AuditModule {}
