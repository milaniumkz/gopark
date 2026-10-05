import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type {
  ManagerAssignedDriverItem,
  ManagerAlertItem,
  ManagerDashboardSummary,
  ManagerDriverDetail,
  ManagerDriverPaymentItem,
  ManagerExecuteActionResult,
  ManagerIncidentItem,
  ManagerIdleVehicleItem,
  ManagerQuickActionItem,
  ManagerRiskStatusReviewItem,
  ManagerStatusRequestItem,
  ManagerTeamItem,
  VehicleDetail,
  VehicleListItem,
} from "@gopark/contracts";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";
import { Roles } from "../rbac/roles.decorator.js";
import type { ExecuteActionDto } from "./dto/execute-action.dto.js";
import { MobileManagerService } from "./mobile-manager.service.js";
import { ApprovalsService } from "../approvals/approvals.service.js";

@Controller("mobile/manager")
export class MobileManagerController {
  constructor(
    private readonly mobileManagerService: MobileManagerService,
    private readonly approvalsService: ApprovalsService,
  ) {}

  @Get("summary")
  @Roles("owner", "admin", "finance", "manager")
  getSummary(@CurrentUser() currentUser: RequestUser | null): Promise<ManagerDashboardSummary> {
    return this.mobileManagerService.getSummary(currentUser);
  }

  @Get("drivers")
  @Roles("owner", "admin", "finance", "manager")
  getDrivers(
    @CurrentUser() currentUser: RequestUser | null,
    @Query("dueDateFrom") dueDateFrom?: string,
    @Query("dueDateTo") dueDateTo?: string,
  ): Promise<ManagerAssignedDriverItem[]> {
    return this.mobileManagerService.getDrivers(currentUser, dueDateFrom, dueDateTo);
  }

  @Get("idle-vehicles")
  @Roles("owner", "admin", "finance", "manager")
  getIdleVehicles(@CurrentUser() currentUser: RequestUser | null): Promise<ManagerIdleVehicleItem[]> {
    return this.mobileManagerService.getIdleVehicles(currentUser);
  }

  @Get("vehicles")
  @Roles("owner", "admin", "finance", "manager")
  getVehicles(@CurrentUser() currentUser: RequestUser | null): Promise<VehicleListItem[]> {
    return this.mobileManagerService.getVehicles(currentUser);
  }

  @Get("vehicles/:vehicleId")
  @Roles("owner", "admin", "finance", "manager")
  getVehicleDetail(
    @Param("vehicleId") vehicleId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<VehicleDetail | null> {
    return this.mobileManagerService.getVehicleDetail(vehicleId, currentUser);
  }

  @Get("managers")
  @Roles("owner", "admin", "finance", "manager")
  getManagers(@CurrentUser() currentUser: RequestUser | null): Promise<ManagerTeamItem[]> {
    return this.mobileManagerService.getManagers(currentUser);
  }

  @Get("drivers/:driverId")
  @Roles("owner", "admin", "finance", "manager")
  getDriverDetail(
    @Param("driverId") driverId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<ManagerDriverDetail | null> {
    return this.mobileManagerService.getDriverDetail(driverId, currentUser);
  }

  @Patch("drivers/:driverId/risk-status")
  @Roles("owner", "admin", "finance", "manager")
  updateDriverRiskStatus(
    @Param("driverId") driverId: string,
    @Body() body: { riskStatus?: string; note?: string },
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<ManagerAssignedDriverItem | null> {
    return this.mobileManagerService.updateDriverRiskStatus(driverId, body, currentUser);
  }

  @Get("drivers/:driverId/payments")
  @Roles("owner", "admin", "finance", "manager")
  getDriverPayments(
    @Param("driverId") driverId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<ManagerDriverPaymentItem[]> {
    return this.mobileManagerService.getDriverPayments(driverId, currentUser);
  }

  @Post("drivers/:driverId/incidents")
  @Roles("owner", "admin", "finance", "manager")
  createDriverIncidentAction(
    @Param("driverId") driverId: string,
    @Body() body: { action?: string; note?: string },
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<ManagerIncidentItem> {
    return this.mobileManagerService.createDriverIncidentAction(driverId, body, currentUser);
  }

  @Post("drivers/:driverId/photo-review")
  @Roles("owner", "admin", "finance", "manager")
  reviewDriverPhoto(
    @Param("driverId") driverId: string,
    @Body() body: { action?: string; note?: string },
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<ManagerDriverDetail | null> {
    return this.mobileManagerService.reviewDriverPhoto(driverId, body, currentUser);
  }

  @Post("drivers/:driverId/terminate-contract")
  @Roles("owner", "admin", "finance", "manager")
  terminateDriverContract(
    @Param("driverId") driverId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<ManagerDriverDetail | null> {
    return this.mobileManagerService.terminateDriverContract(driverId, currentUser);
  }

  @Get("alerts")
  @Roles("owner", "admin", "finance", "manager")
  getAlerts(@CurrentUser() currentUser: RequestUser | null): Promise<ManagerAlertItem[]> {
    return this.mobileManagerService.getAlerts(currentUser);
  }

  @Get("status-requests")
  @Roles("owner", "admin", "finance", "manager")
  getStatusRequests(@CurrentUser() currentUser: RequestUser | null): Promise<ManagerStatusRequestItem[]> {
    return this.mobileManagerService.getStatusRequests(currentUser);
  }

  @Get("risk-status-requests")
  @Roles("owner", "admin", "finance", "manager")
  getRiskStatusRequests(@CurrentUser() currentUser: RequestUser | null): Promise<ManagerRiskStatusReviewItem[]> {
    return this.mobileManagerService.getRiskStatusRequests(currentUser);
  }

  @Post("risk-status-requests/:requestId/approve")
  @Roles("owner", "admin", "finance", "manager")
  approveRiskStatusRequest(
    @Param("requestId") requestId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<ManagerRiskStatusReviewItem | null> {
    return this.mobileManagerService.reviewRiskStatusRequest(requestId, "approve", currentUser);
  }

  @Post("risk-status-requests/:requestId/reject")
  @Roles("owner", "admin", "finance", "manager")
  rejectRiskStatusRequest(
    @Param("requestId") requestId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<ManagerRiskStatusReviewItem | null> {
    return this.mobileManagerService.reviewRiskStatusRequest(requestId, "reject", currentUser);
  }

  @Post("status-requests/:requestId/approve")
  @Roles("owner", "admin", "finance", "manager")
  approveStatusRequest(
    @Param("requestId") requestId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ) {
    return this.approvalsService.approveStatusRequest(requestId, currentUser);
  }

  @Post("status-requests/:requestId/reject")
  @Roles("owner", "admin", "finance", "manager")
  rejectStatusRequest(
    @Param("requestId") requestId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ) {
    return this.approvalsService.rejectStatusRequest(requestId, currentUser);
  }

  @Get("quick-actions")
  @Roles("owner", "admin", "finance", "manager")
  getQuickActions(@CurrentUser() currentUser: RequestUser | null): Promise<ManagerQuickActionItem[]> {
    return this.mobileManagerService.getQuickActions(currentUser);
  }

  @Get("incidents")
  @Roles("owner", "admin", "finance", "manager")
  getIncidents(@CurrentUser() currentUser: RequestUser | null): Promise<ManagerIncidentItem[]> {
    return this.mobileManagerService.getIncidents(currentUser);
  }

  @Patch("incidents/:incidentId/action")
  @Roles("owner", "admin", "finance", "manager")
  updateIncidentAction(
    @Param("incidentId") incidentId: string,
    @Body() body: { action?: string; note?: string },
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<ManagerIncidentItem> {
    return this.mobileManagerService.updateIncidentAction(incidentId, body, currentUser);
  }

  @Post("quick-actions/execute")
  @Roles("owner", "admin", "finance", "manager")
  executeAction(
    @Body() body: ExecuteActionDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<ManagerExecuteActionResult> {
    return this.mobileManagerService.executeAction(body.actionId, currentUser);
  }
}
