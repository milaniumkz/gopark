import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { DriverStatusRequestItem, PayoutListItem } from "@gopark/contracts";
import {
  makeDriverRepository,
  makeObligationRepository,
  makePayoutRepository,
  makeSettingsRepository,
  makeStatusRequestRepository,
  makeUserRepository,
} from "../../common/application/repository.factory.js";
import type {
  DriverRepository,
  ObligationRepository,
  PayoutRepository,
  SettingsRepository,
  StatusRequestRepository,
  UserRepository,
} from "../../common/repositories/index.js";
import { AuditLogService } from "../audit/audit-log.service.js";
import { NotificationsCreateService } from "../notifications/notifications-create.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { parseDriverStatusRequestPeriod, periodsOverlap } from "../mobile-read/driver-status-request-period.js";
import type { RequestUser } from "../rbac/request-user.js";
import { matchesCompanyScope } from "../rbac/company-scope.js";

@Injectable()
export class ApprovalsService {
  private readonly payoutRepository: PayoutRepository = makePayoutRepository();
  private readonly settingsRepository: SettingsRepository = makeSettingsRepository();
  private readonly statusRequestRepository: StatusRequestRepository = makeStatusRequestRepository();
  private readonly driverRepository: DriverRepository = makeDriverRepository();
  private readonly obligationRepository: ObligationRepository = makeObligationRepository();
  private readonly userRepository: UserRepository = makeUserRepository();

  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly notificationsCreateService: NotificationsCreateService,
    private readonly outboxService: OutboxService,
  ) {}

  async approvePayout(payoutId: string, currentUser: RequestUser | null): Promise<PayoutListItem> {
    if (!currentUser) {
      throw new ForbiddenException("Current user is required");
    }

    const existingPayout = await this.payoutRepository.getById(payoutId);
    if (!existingPayout) {
      throw new NotFoundException("Payout not found");
    }
    await this.assertCanAccessDriverCompany(existingPayout.driverId, currentUser);

    await this.assertApprovalAllowed(existingPayout.amount, currentUser);

    const payout = await this.payoutRepository.approve(payoutId, {
      approvedByUserId: currentUser.id,
    });

    if (!payout) {
      throw new NotFoundException("Payout not found");
    }

    await this.auditLogService.write("payout.approved", "payout", payout.id, {
      beforeData: { payout: existingPayout },
      afterData: {
        actor: this.serializeActor(currentUser),
        payout,
        approvedByUserId: currentUser.id,
      },
    });
    await this.notificationsCreateService.createDriverPayoutApproved(payout.driverId);
    await this.outboxService.create("payout.approved", "payout", payout.id, {
      payoutId: payout.id,
      approvedByUserId: currentUser.id,
      driverId: payout.driverId,
      amount: payout.amount,
    });

    return payout;
  }

  async rejectPayout(payoutId: string, currentUser: RequestUser | null): Promise<PayoutListItem> {
    if (!currentUser) {
      throw new ForbiddenException("Current user is required");
    }

    const existingPayout = await this.payoutRepository.getById(payoutId);
    if (!existingPayout) {
      throw new NotFoundException("Payout not found");
    }
    await this.assertCanAccessDriverCompany(existingPayout.driverId, currentUser);

    const payout = await this.payoutRepository.reject(payoutId, {
      approvedByUserId: currentUser.id,
    });

    if (!payout) {
      throw new NotFoundException("Payout not found");
    }

    await this.auditLogService.write("payout.rejected", "payout", payout.id, {
      beforeData: { payout: existingPayout },
      afterData: {
        actor: this.serializeActor(currentUser),
        payout,
        rejectedByUserId: currentUser.id,
      },
    });
    await this.notificationsCreateService.createDriverPayoutRejected(payout.driverId);
    await this.outboxService.create("payout.rejected", "payout", payout.id, {
      payoutId: payout.id,
      rejectedByUserId: currentUser.id,
      driverId: payout.driverId,
      amount: payout.amount,
    });

    return payout;
  }

  async approveStatusRequest(requestId: string, currentUser: RequestUser | null): Promise<DriverStatusRequestItem> {
    const request = await this.getPendingStatusRequest(requestId, currentUser);
    await this.assertNoApprovedOverlap(request);
    const requestedPeriod = parseDriverStatusRequestPeriod(request.period);

    const updated = await this.statusRequestRepository.updateStatus(requestId, "approved");
    if (!updated) {
      throw new NotFoundException("Status request not found");
    }

    if (request.driverId && requestedPeriod) {
      await this.obligationRepository.deferByStatusRequest(
        updated.id,
        request.driverId,
        requestedPeriod.startDate,
        requestedPeriod.endDate,
      );
    }

    await this.auditLogService.write("driver_status_request.approved", "driver_status_request", updated.id, {
      beforeData: { request },
      afterData: {
        actor: currentUser ? this.serializeActor(currentUser) : null,
        request: updated,
      },
    });
    if (updated.driverId) {
      await this.notificationsCreateService.createDriverStatusRequestApproved(updated.driverId);
    }
    await this.outboxService.create("driver_status_request.approved", "driver_status_request", updated.id, {
      requestId: updated.id,
      driverId: updated.driverId,
      type: updated.type,
      period: updated.period,
      approvedByUserId: currentUser?.id ?? null,
    });

    return updated;
  }

  async rejectStatusRequest(requestId: string, currentUser: RequestUser | null): Promise<DriverStatusRequestItem> {
    const request = await this.getPendingStatusRequest(requestId, currentUser);
    const updated = await this.statusRequestRepository.updateStatus(requestId, "rejected");
    if (!updated) {
      throw new NotFoundException("Status request not found");
    }

    await this.auditLogService.write("driver_status_request.rejected", "driver_status_request", updated.id, {
      beforeData: { request },
      afterData: {
        actor: currentUser ? this.serializeActor(currentUser) : null,
        request: updated,
      },
    });
    if (updated.driverId) {
      await this.notificationsCreateService.createDriverStatusRequestRejected(updated.driverId);
    }
    await this.outboxService.create("driver_status_request.rejected", "driver_status_request", updated.id, {
      requestId: updated.id,
      driverId: updated.driverId,
      type: updated.type,
      period: updated.period,
      rejectedByUserId: currentUser?.id ?? null,
    });

    return updated;
  }

  private async assertApprovalAllowed(amount: number, currentUser: RequestUser): Promise<void> {
    const settings = await this.settingsRepository.getOverview();

    if (amount > settings.payoutApprovalThreshold && currentUser.role === "finance") {
      throw new ForbiddenException("Payouts above the approval threshold require admin or owner approval");
    }
  }

  private serializeActor(currentUser: RequestUser): Record<string, unknown> {
    return {
      id: currentUser.id,
      role: currentUser.role,
      companyName: currentUser.companyName ?? null,
      managerLevel: currentUser.managerLevel ?? null,
      customRoleKey: currentUser.customRoleKey ?? null,
    };
  }

  private async getPendingStatusRequest(
    requestId: string,
    currentUser: RequestUser | null,
  ): Promise<DriverStatusRequestItem> {
    if (!currentUser) {
      throw new ForbiddenException("Current user is required");
    }

    const request = await this.statusRequestRepository.getById(requestId);
    if (!request) {
      throw new NotFoundException("Status request not found");
    }

    if (request.status !== "pending") {
      throw new BadRequestException("Only pending status requests can be reviewed");
    }

    if (currentUser.role === "manager") {
      const driver = await this.driverRepository.getById(request.driverId ?? "");
      if (!driver) {
        throw new NotFoundException("Driver not found");
      }

      const managerIds = await this.getManagerScopeIds(currentUser);
      if (!driver.managerId || !managerIds.has(driver.managerId)) {
        throw new ForbiddenException("Managers can review only their assigned drivers");
      }
    }

    await this.assertCanAccessDriverCompany(request.driverId ?? null, currentUser);

    return request;
  }

  private async assertCanAccessDriverCompany(
    driverId: string | null,
    currentUser: RequestUser | null,
  ): Promise<void> {
    if (!driverId || !currentUser?.companyName) {
      return;
    }

    const driver = await this.driverRepository.getById(driverId);
    if (!driver) {
      throw new NotFoundException("Driver not found");
    }

    if (!matchesCompanyScope(currentUser, driver.companyName)) {
      throw new ForbiddenException("Current company cannot access this driver");
    }
  }

  private async getManagerScopeIds(currentUser: RequestUser): Promise<Set<string>> {
    return this.userRepository.getManagerScopeIds(currentUser.id, currentUser.companyName ?? null);
  }

  private async assertNoApprovedOverlap(request: DriverStatusRequestItem): Promise<void> {
    const requestedPeriod = parseDriverStatusRequestPeriod(request.period);
    if (!requestedPeriod || !request.driverId) {
      return;
    }

    const existingRequests = await this.statusRequestRepository.listByDriver(request.driverId);
    const overlappingApproved = existingRequests
      .filter((item) => item.id !== request.id && item.status === "approved")
      .find((item) => {
        const existingPeriod = parseDriverStatusRequestPeriod(item.period);
        return existingPeriod ? periodsOverlap(requestedPeriod, existingPeriod) : false;
      });

    if (overlappingApproved) {
      throw new BadRequestException("Status request overlaps an already approved period");
    }
  }
}
