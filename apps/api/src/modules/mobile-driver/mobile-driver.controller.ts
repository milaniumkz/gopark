import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import type {
  DriverActiveContractSummary,
  DriverCreateStatusRequest,
  DriverDebtSummary,
  DriverFakeBankPaymentRequest,
  DriverHomeSummary,
  DriverPaymentScheduleItem,
  DriverPaymentStatementItem,
  DriverNotificationItem,
  DriverProfileSummary,
  DriverPayoutRequest,
  DriverStatusRequestItem,
  PaymentListItem,
  PayoutListItem,
} from "@gopark/contracts";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";
import { Roles } from "../rbac/roles.decorator.js";
import { MobileDriverService } from "./mobile-driver.service.js";

@Controller("mobile/driver")
export class MobileDriverController {
  constructor(private readonly mobileDriverService: MobileDriverService) {}

  @Get(":driverId/debt-summary")
  @Roles("owner", "admin", "finance", "manager", "driver")
  async getDebtSummary(
    @Param("driverId") driverId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<DriverDebtSummary> {
    return this.mobileDriverService.getDebtSummary(driverId, currentUser);
  }

  @Get(":driverId/home-summary")
  @Roles("owner", "admin", "finance", "manager", "driver")
  async getHomeSummary(
    @Param("driverId") driverId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<DriverHomeSummary> {
    return this.mobileDriverService.getHomeSummary(driverId, currentUser);
  }

  @Get(":driverId/profile-summary")
  @Roles("owner", "admin", "finance", "manager", "driver")
  async getProfileSummary(
    @Param("driverId") driverId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<DriverProfileSummary | null> {
    return this.mobileDriverService.getProfileSummary(driverId, currentUser);
  }

  @Get(":driverId/contract")
  @Roles("owner", "admin", "finance", "manager", "driver")
  getActiveContract(
    @Param("driverId") driverId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<DriverActiveContractSummary | null> {
    return this.mobileDriverService.getActiveContract(driverId, currentUser);
  }

  @Get(":driverId/payouts")
  @Roles("owner", "admin", "finance", "manager", "driver")
  async getPayouts(
    @Param("driverId") driverId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<PayoutListItem[]> {
    return this.mobileDriverService.getPayouts(driverId, currentUser);
  }

  @Get(":driverId/status-requests")
  @Roles("owner", "admin", "finance", "manager", "driver")
  getStatusRequests(
    @Param("driverId") driverId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<DriverStatusRequestItem[]> {
    return this.mobileDriverService.listStatusRequests(driverId, currentUser);
  }

  @Get(":driverId/payment-schedule")
  @Roles("owner", "admin", "finance", "manager", "driver")
  getPaymentSchedule(
    @Param("driverId") driverId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<DriverPaymentScheduleItem[]> {
    return this.mobileDriverService.getPaymentSchedule(driverId, currentUser);
  }

  @Get(":driverId/payment-statement")
  @Roles("owner", "admin", "finance", "manager", "driver")
  getPaymentStatement(
    @Param("driverId") driverId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<DriverPaymentStatementItem[]> {
    return this.mobileDriverService.getPaymentStatement(driverId, currentUser);
  }

  @Get(":driverId/notifications")
  @Roles("owner", "admin", "finance", "manager", "driver")
  getNotifications(
    @Param("driverId") driverId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<DriverNotificationItem[]> {
    return this.mobileDriverService.getNotifications(driverId, currentUser);
  }

  @Post(":driverId/chat/read")
  @Roles("owner", "admin", "finance", "manager", "driver")
  markChatRead(
    @Param("driverId") driverId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<{ ok: true }> {
    return this.mobileDriverService.markChatRead(driverId, currentUser);
  }

  @Post(":driverId/payouts")
  @Roles("owner", "admin", "finance", "manager", "driver")
  createPayout(
    @Param("driverId") driverId: string,
    @Body() body: DriverPayoutRequest,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<PayoutListItem> {
    return this.mobileDriverService.createPayout(driverId, body, currentUser);
  }

  @Post(":driverId/payments/fake-bank")
  @Roles("owner", "admin", "finance", "manager", "driver")
  createFakeBankPayment(
    @Param("driverId") driverId: string,
    @Body() body: DriverFakeBankPaymentRequest,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<PaymentListItem> {
    return this.mobileDriverService.createFakeBankPayment(driverId, body, currentUser);
  }

  @Post(":driverId/status-requests")
  @Roles("owner", "admin", "finance", "manager", "driver")
  createStatusRequest(
    @Param("driverId") driverId: string,
    @Body() body: DriverCreateStatusRequest,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<DriverStatusRequestItem> {
    return this.mobileDriverService.createStatusRequest(driverId, body, currentUser);
  }

  @Post(":driverId/photo")
  @Roles("owner", "admin", "finance", "manager", "driver")
  submitPhoto(
    @Param("driverId") driverId: string,
    @Body() body: { photoDataUrl?: string },
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<DriverProfileSummary | null> {
    return this.mobileDriverService.submitPhoto(driverId, body, currentUser);
  }
}
