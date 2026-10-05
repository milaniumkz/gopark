import { Controller, Get, Query } from "@nestjs/common";
import type { DashboardOverview, DashboardSummary } from "@gopark/contracts";
import { Roles } from "../rbac/roles.decorator.js";
import { DashboardService } from "./dashboard.service.js";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";
import { getScopedCompanyName } from "../rbac/company-scope.js";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("summary")
  @Roles("owner", "admin", "finance", "manager", "auditor")
  getSummary(@CurrentUser() currentUser: RequestUser | null): Promise<DashboardSummary> {
    return this.dashboardService.getSummary(getScopedCompanyName(currentUser));
  }

  @Get("overview")
  @Roles("owner", "admin", "finance", "manager", "auditor")
  getOverview(
    @CurrentUser() currentUser: RequestUser | null,
    @Query("period") period: "today" | "week" | "month" | "year" = "today",
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("companyName") companyName?: string,
  ): Promise<DashboardOverview> {
    const scopedCompanyName = getScopedCompanyName(currentUser);
    const selectedCompanyName = scopedCompanyName ?? (companyName && companyName !== "all" ? companyName : null);
    return this.dashboardService.getOverview(period, selectedCompanyName, startDate, endDate);
  }
}
