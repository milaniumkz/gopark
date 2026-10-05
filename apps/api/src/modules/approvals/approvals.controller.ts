import { Body, Controller, Post, Param } from "@nestjs/common";
import type { DriverStatusRequestItem, PayoutListItem } from "@gopark/contracts";
import { ApprovalsService } from "./approvals.service.js";
import { Roles } from "../rbac/roles.decorator.js";
import type { ApprovePayoutDto } from "../payouts/dto/approve-payout.dto.js";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";

@Controller("approvals")
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Post("payouts/:payoutId/approve")
  @Roles("owner", "admin", "finance")
  async approvePayout(
    @Param("payoutId") payoutId: string,
    @Body() _body: ApprovePayoutDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<PayoutListItem> {
    return this.approvalsService.approvePayout(payoutId, currentUser);
  }

  @Post("payouts/:payoutId/reject")
  @Roles("owner", "admin", "finance")
  async rejectPayout(
    @Param("payoutId") payoutId: string,
    @Body() _body: ApprovePayoutDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<PayoutListItem> {
    return this.approvalsService.rejectPayout(payoutId, currentUser);
  }

  @Post("status-requests/:requestId/approve")
  @Roles("owner", "admin", "finance", "manager")
  async approveStatusRequest(
    @Param("requestId") requestId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<DriverStatusRequestItem> {
    return this.approvalsService.approveStatusRequest(requestId, currentUser);
  }

  @Post("status-requests/:requestId/reject")
  @Roles("owner", "admin", "finance", "manager")
  async rejectStatusRequest(
    @Param("requestId") requestId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<DriverStatusRequestItem> {
    return this.approvalsService.rejectStatusRequest(requestId, currentUser);
  }
}
