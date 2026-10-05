import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  DriverActiveContractSummary,
  DriverCreateStatusRequest,
  DriverDebtSummary,
  DriverFakeBankPaymentRequest,
  DriverHomeSummary,
  DriverNotificationItem,
  DriverPaymentScheduleItem,
  DriverPaymentStatementItem,
  DriverProfileSummary,
  DriverStatusRequestItem,
  DriverPayoutRequest,
  PaymentListItem,
  PayoutListItem,
} from "@gopark/contracts";
import { statusRequestTypes } from "@gopark/contracts";
import {
  makeDriverRepository,
  makeNotificationRepository,
  makeSettingsRepository,
  makeStatusRequestRepository,
} from "../../common/application/repository.factory.js";
import type {
  DriverRepository,
  NotificationRepository,
  SettingsRepository,
  StatusRequestRepository,
} from "../../common/repositories/index.js";
import { FinanceWorkflowService } from "../finance-workflow/finance-workflow.service.js";
import { MobileAccessService } from "../mobile-read/mobile-access.service.js";
import { DriverMobileReadService } from "../mobile-read/driver-mobile-read.service.js";
import { NotificationsCreateService } from "../notifications/notifications-create.service.js";
import {
  parseDriverStatusRequestPeriod,
  periodsOverlap,
} from "../mobile-read/driver-status-request-period.js";
import type { RequestUser } from "../rbac/request-user.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

@Injectable()
export class MobileDriverService {
  private readonly notificationRepository: NotificationRepository = makeNotificationRepository();
  private readonly driverRepository: DriverRepository = makeDriverRepository();
  private readonly settingsRepository: SettingsRepository = makeSettingsRepository();
  private readonly statusRequestRepository: StatusRequestRepository = makeStatusRequestRepository();
  private readonly prismaService = new PrismaService();

  constructor(
    private readonly driverMobileReadService: DriverMobileReadService,
    private readonly financeWorkflowService: FinanceWorkflowService,
    private readonly mobileAccessService: MobileAccessService,
    private readonly notificationsCreateService: NotificationsCreateService,
  ) {}

  async getDebtSummary(driverId: string, currentUser: RequestUser | null): Promise<DriverDebtSummary> {
    if (!isUuid(driverId)) {
      return {
        driverId,
        totalDebt: 0,
        creditBalance: 0,
        overdueDebt: 0,
        nextPaymentAmount: 0,
        nextPaymentDate: null,
      };
    }

    await this.mobileAccessService.assertCanAccessDriver(driverId, currentUser);
    return this.driverMobileReadService.getDriverDebtSummarySnapshot(driverId);
  }

  async getHomeSummary(driverId: string, currentUser: RequestUser | null): Promise<DriverHomeSummary> {
    if (!isUuid(driverId)) {
      return {
        driverId,
        driverName: "Неизвестный водитель",
        currentStatus: "unknown",
        currentDebt: 0,
        creditBalance: 0,
        overdueDebt: 0,
        nextPaymentAmount: 0,
        nextPaymentDate: null,
        monthlyGpsAmount: 0,
        monthlyInsuranceAmount: 0,
        gpsDueAmount: 0,
        gpsDueDate: null,
        insuranceDueAmount: 0,
        insuranceDueDate: null,
        yandexBalance: 0,
        availableToWithdraw: 0,
        unreadNotifications: 0,
      };
    }

    await this.mobileAccessService.assertCanAccessDriver(driverId, currentUser);
    const driver = await this.driverRepository.getById(driverId);
    const snapshot = await this.driverMobileReadService.getDriverHomeSnapshot(
      driverId,
      currentUser?.id ?? null,
    );

    return {
      driverId,
      driverName: snapshot.driverName,
      currentStatus: snapshot.currentStatus,
      currentDebt: snapshot.finance.currentDebt,
      creditBalance: snapshot.finance.creditBalance,
      overdueDebt: snapshot.finance.overdueDebt,
      nextPaymentAmount: snapshot.finance.nextPaymentAmount,
      nextPaymentDate: snapshot.finance.nextPaymentDate,
      monthlyGpsAmount: snapshot.monthlyGpsAmount,
      monthlyInsuranceAmount: snapshot.monthlyInsuranceAmount,
      gpsDueAmount: snapshot.gpsDueAmount,
      gpsDueDate: snapshot.gpsDueDate,
      insuranceDueAmount: snapshot.insuranceDueAmount,
      insuranceDueDate: snapshot.insuranceDueDate,
      yandexBalance: snapshot.finance.yandexBalance,
      availableToWithdraw: Math.max(0, snapshot.finance.yandexBalance - snapshot.finance.reservedPayoutAmount),
      unreadNotifications: snapshot.unreadNotifications,
      photoUrl: driver?.photoUrl ?? null,
      photoStatus: driver?.photoStatus ?? "missing",
      photoReviewNote: driver?.photoReviewNote ?? null,
    };
  }

  async getProfileSummary(driverId: string, currentUser: RequestUser | null): Promise<DriverProfileSummary | null> {
    if (!isUuid(driverId)) {
      return null;
    }

    await this.mobileAccessService.assertCanAccessDriver(driverId, currentUser);
    const [snapshot, driver] = await Promise.all([
      this.driverMobileReadService.getDriverProfileSnapshot(driverId),
      this.driverRepository.getById(driverId),
    ]);
    if (!snapshot) {
      return null;
    }

    return {
      driverId: snapshot.driverId,
      driverName: snapshot.driverName,
      phone: snapshot.phone,
      currentStatus: snapshot.currentStatus,
      assignedVehicle: snapshot.assignment.vehicle,
      activeContractNumber: snapshot.assignment.contractNumber,
      managerId: snapshot.managerId,
      totalObligations: snapshot.totalObligations,
      totalPaid: snapshot.totalPaid,
      currentDebt: snapshot.currentDebt,
      creditBalance: snapshot.creditBalance,
      overdueDebt: snapshot.overdueDebt,
      lastPaymentDate: snapshot.lastPaymentDate,
      yandexBalance: snapshot.yandexBalance,
      photoUrl: driver?.photoUrl ?? null,
      photoStatus: driver?.photoStatus ?? "missing",
      photoUploadedAt: driver?.photoUploadedAt ?? null,
      photoReviewedAt: driver?.photoReviewedAt ?? null,
      photoReviewNote: driver?.photoReviewNote ?? null,
    };
  }

  async submitPhoto(
    driverId: string,
    body: { photoDataUrl?: string },
    currentUser: RequestUser | null,
  ): Promise<DriverProfileSummary | null> {
    await this.mobileAccessService.assertCanAccessDriver(driverId, currentUser);
    const photoDataUrl = body.photoDataUrl?.trim() ?? "";
    if (!photoDataUrl.startsWith("data:image/") || photoDataUrl.length > 3_200_000) {
      throw new BadRequestException("Photo must be an image data URL up to 3 MB");
    }

    const driver = await this.driverRepository.getById(driverId);
    if (!driver) {
      return null;
    }
    if (driver.photoStatus === "approved") {
      throw new BadRequestException("Approved driver photo cannot be changed");
    }
    if (driver.photoStatus === "pending") {
      throw new BadRequestException("Driver photo is already awaiting review");
    }

    const prisma = this.prismaService.client;
    if (prisma) {
      await prisma.driver.update({
        where: { id: driverId },
        data: {
          photoUrl: photoDataUrl,
          photoStatus: "pending",
          photoUploadedAt: new Date(),
          photoReviewedAt: null,
          photoReviewedByUserId: null,
          photoReviewNote: null,
        },
      });
    }

    await this.notificationsCreateService.createManagerDriverEvent(
      driverId,
      "Фото водителя",
      "водитель зарегистрировался и загрузил фото",
    );

    return this.getProfileSummary(driverId, currentUser);
  }

  async getActiveContract(
    driverId: string,
    currentUser: RequestUser | null,
  ): Promise<DriverActiveContractSummary | null> {
    if (!isUuid(driverId)) {
      return null;
    }

    await this.mobileAccessService.assertCanAccessDriver(driverId, currentUser);
    return this.driverMobileReadService.getDriverActiveContractSnapshot(driverId);
  }

  async getPayouts(driverId: string, currentUser: RequestUser | null): Promise<PayoutListItem[]> {
    if (!isUuid(driverId)) {
      return [];
    }

    await this.mobileAccessService.assertCanAccessDriver(driverId, currentUser);
    return this.driverMobileReadService.getDriverPayouts(driverId);
  }

  async listStatusRequests(driverId: string, currentUser: RequestUser | null): Promise<DriverStatusRequestItem[]> {
    if (!isUuid(driverId)) {
      return [];
    }

    await this.mobileAccessService.assertCanAccessDriver(driverId, currentUser);
    return this.driverMobileReadService.listDriverStatusRequests(driverId);
  }

  async getPaymentSchedule(driverId: string, currentUser: RequestUser | null): Promise<DriverPaymentScheduleItem[]> {
    if (!isUuid(driverId)) {
      return [];
    }

    await this.mobileAccessService.assertCanAccessDriver(driverId, currentUser);
    return this.driverMobileReadService.getPaymentSchedule(driverId);
  }

  async getPaymentStatement(driverId: string, currentUser: RequestUser | null): Promise<DriverPaymentStatementItem[]> {
    if (!isUuid(driverId)) {
      return [];
    }

    await this.mobileAccessService.assertCanAccessDriver(driverId, currentUser);
    return this.driverMobileReadService.getDriverPaymentStatement(driverId);
  }

  async getNotifications(driverId: string, currentUser: RequestUser | null): Promise<DriverNotificationItem[]> {
    if (!isUuid(driverId)) {
      return [];
    }

    await this.mobileAccessService.assertCanAccessDriver(driverId, currentUser);
    const items = await this.notificationRepository.list();

    return items.filter(
      (item) =>
        item.driverId === driverId ||
        (currentUser?.id != null && item.userId === currentUser.id),
    );
  }

  async markChatRead(driverId: string, currentUser: RequestUser | null): Promise<{ ok: true }> {
    if (!isUuid(driverId)) {
      return { ok: true };
    }

    await this.mobileAccessService.assertCanAccessDriver(driverId, currentUser);
    const prisma = this.prismaService.client;
    if (!prisma) {
      const items = await this.notificationRepository.list();
      await Promise.all(
        items
          .filter(
            (item) =>
              item.status === "pending" &&
              item.template === "chat_message_received" &&
              (item.driverId === driverId ||
                (currentUser?.id != null && item.userId === currentUser.id)),
          )
          .map((item) => this.notificationRepository.updateStatus(item.id, "published")),
      );
      return { ok: true };
    }

    const driver = await prisma.driver.findFirst({
      where: {
        OR: [
          { id: driverId },
          { userId: driverId },
          ...(currentUser?.id ? [{ userId: currentUser.id }] : []),
        ],
      },
      select: { id: true, userId: true },
    });
    const driverIds = [driverId, driver?.id].filter(Boolean) as string[];
    const userIds = [driverId, currentUser?.id, driver?.userId].filter(Boolean) as string[];

    await prisma.notification.updateMany({
      where: {
        status: "pending",
        templateCode: "chat_message_received",
        OR: [
          ...driverIds.map((id) => ({ driverId: id })),
          ...userIds.map((id) => ({ userId: id })),
        ],
      },
      data: {
        status: "published",
        deliveredAt: new Date(),
      },
    });

    return { ok: true };
  }

  async createStatusRequest(
    driverId: string,
    body: DriverCreateStatusRequest,
    currentUser: RequestUser | null,
  ): Promise<DriverStatusRequestItem> {
    await this.mobileAccessService.assertCanAccessDriver(driverId, currentUser);
    await this.validateStatusRequestType(body.type);
    await this.validateStatusRequestPeriod(driverId, body.period);
    const note = body.note?.trim() || null;
    if (body.type === "force_majeure" && !note) {
      throw new BadRequestException("Force majeure reason is required");
    }
    const request = await this.statusRequestRepository.create(driverId, {
      ...body,
      note,
    });
    await Promise.allSettled([
      this.notificationsCreateService.createDriverStatusRequestCreated(driverId),
      this.notificationsCreateService.createManagerStatusRequestCreated(
        driverId,
        body.type,
        note ? `${body.period}. Причина: ${note}` : body.period,
      ),
    ]);
    return request;
  }

  async createPayout(
    driverId: string,
    body: DriverPayoutRequest,
    currentUser: RequestUser | null,
  ): Promise<PayoutListItem> {
    await this.mobileAccessService.assertCanAccessDriver(driverId, currentUser);
    return this.financeWorkflowService.requestPayout({
      driverId,
      amount: body.amount,
      payoutDestination: body.payoutDestination,
    });
  }

  async createFakeBankPayment(
    driverId: string,
    body: DriverFakeBankPaymentRequest,
    currentUser: RequestUser | null,
  ): Promise<PaymentListItem> {
    await this.mobileAccessService.assertCanAccessDriver(driverId, currentUser);

    const activeContract = await this.driverMobileReadService.getDriverActiveContractSnapshot(driverId);
    if (!activeContract) {
      throw new BadRequestException("Active contract is required to register a payment");
    }

    const debtSummary = await this.driverMobileReadService.getDriverDebtSummarySnapshot(driverId);
    const defaultAmount = debtSummary.overdueDebt > 0
      ? debtSummary.overdueDebt
      : debtSummary.nextPaymentAmount;
    const amount = Number(body.amount ?? defaultAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException("Payment amount must be greater than 0");
    }

    const payment = await this.financeWorkflowService.registerPayment({
      driverId,
      contractId: activeContract.id,
      amount,
      provider: "bank",
      paymentForDate: new Date().toISOString().slice(0, 10),
      paymentType: body.paymentType,
    });
    await Promise.allSettled([
      this.notificationsCreateService.createDriverPaymentRegistered(driverId),
      this.notificationsCreateService.createManagerPaymentRegistered(driverId, amount),
    ]);
    return payment;
  }

  private async validateStatusRequestType(type: DriverCreateStatusRequest["type"]): Promise<void> {
    const settings = await this.settingsRepository.getOverview();
    const allowedTypes = settings.allowedStatusRequestTypes.length
      ? settings.allowedStatusRequestTypes
      : [...statusRequestTypes];

    if (!allowedTypes.includes(type)) {
      throw new BadRequestException(`Unsupported status request type: ${type}`);
    }
  }

  private async validateStatusRequestPeriod(driverId: string, period: string): Promise<void> {
    const requestedPeriod = parseDriverStatusRequestPeriod(period);
    if (!requestedPeriod) {
      throw new BadRequestException("Status request period must be YYYY-MM-DD or YYYY-MM-DD .. YYYY-MM-DD");
    }

    const existingRequests = await this.statusRequestRepository.listByDriver(driverId);
    const overlapping = existingRequests
      .filter((item) => item.status === "pending" || item.status === "approved")
      .find((item) => {
        const existingPeriod = parseDriverStatusRequestPeriod(item.period);
        return existingPeriod ? periodsOverlap(requestedPeriod, existingPeriod) : false;
      });

    if (overlapping) {
      throw new BadRequestException("Status request period overlaps an existing pending or approved request");
    }
  }
}
