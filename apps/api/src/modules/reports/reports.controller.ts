import { Controller, Get } from "@nestjs/common";
import type { ReportsOverview } from "@gopark/contracts";
import { Roles } from "../rbac/roles.decorator.js";
import { ReportsService } from "./reports.service.js";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";
import { getScopedCompanyName } from "../rbac/company-scope.js";

@Controller("reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("overview")
  @Roles("owner", "admin", "finance", "auditor")
  overview(@CurrentUser() currentUser: RequestUser | null): Promise<ReportsOverview> {
    return this.reportsService.getOverview(getScopedCompanyName(currentUser));
  }
}
