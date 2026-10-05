import { Controller, Get } from "@nestjs/common";
import type { AuditLogItem } from "@gopark/contracts";
import { Roles } from "../rbac/roles.decorator.js";
import { AuditService } from "./audit.service.js";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";

@Controller("audit")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get("logs")
  @Roles("owner", "admin", "auditor")
  async listLogs(@CurrentUser() currentUser: RequestUser | null): Promise<AuditLogItem[]> {
    if (currentUser?.companyName) {
      return this.auditService.listByCompany(currentUser.companyName);
    }

    return this.auditService.list();
  }
}
