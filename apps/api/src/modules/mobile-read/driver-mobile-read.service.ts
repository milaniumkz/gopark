import { Injectable } from "@nestjs/common";
import type {
  DriverDebtSummary,
  DriverPaymentScheduleItem,
  DriverPaymentStatementItem,
  DriverStatusRequestItem,
  PayoutListItem,
} from "@gopark/contracts";
import {
  makeCarRepository,
  makeContractRepository,
  makeDriverCreditBalanceRepository,
  makeDriverRepository,
  makeIncidentRepository,
  makeNotificationRepository,
  makeObligationRepository,
  makePaymentRepository,
  makePayoutRepository,
  makeStatusRequestRepository,
  makeYandexBalanceRepository,
} from "../../common/application/repository.factory.js";
import type {
  CarRepository,
  ContractRepository,
  DriverCreditBalanceRepository,
  DriverRepository,
  IncidentRepository,
  NotificationRepository,
  ObligationRepository,
  PaymentRepository,
  PayoutRepository,
  StatusRequestRepository,
  YandexBalanceRepository,
} from "../../common/repositories/index.js";
import { DriverStatusRequestPolicyService } from "./driver-status-request-policy.service.js";

export interface DriverFinanceSnapshot {
  currentDebt: number;
  creditBalance: number;
  overdueDebt: number;
  overdueSinceDate: string | null;
  overdueUntilDate: string | null;
  nextPaymentAmount: number;
  nextPaymentDate: string | null;
  lastPaymentDate: string | null;
  yandexBalance: number;
  reservedPayoutAmount: number;
}

export interface DriverAssignmentSnapshot {
  vehicle: string | null;
  vehicleStatus: string | null;
  contractNumber: string | null;
}

export interface DriverAssignmentSnapshotInput {
  driverId: string;
  activeContractId: string | null;
}

export interface DriverHomeSnapshot {
  driverName: string;
  currentStatus: string;
  finance: DriverFinanceSnapshot;
  monthlyGpsAmount: number;
  monthlyInsuranceAmount: number;
  gpsDueAmount: number;
  gpsDueDate: string | null;
  insuranceDueAmount: number;
  insuranceDueDate: string | null;
  unreadNotifications: number;
}

export interface DriverProfileSnapshot {
  driverId: string;
  driverName: string;
  phone: string;
  currentStatus: string;
  assignment: DriverAssignmentSnapshot;
  managerId: string | null;
  totalObligations: number;
  totalPaid: number;
  currentDebt: number;
  creditBalance: number;
  overdueDebt: number;
  lastPaymentDate: string | null;
  yandexBalance: number;
}

export interface ManagerDriversSummarySnapshot {
  overdueDrivers: number;
  paymentDueDrivers: number;
  dueTodayAmount: number;
  pendingStatusRequests: number;
  openIncidents: number;
}

export interface ManagerDriverDetailSnapshot {
  assignment: DriverAssignmentSnapshot;
  finance: DriverFinanceSnapshot;
  nextPaymentAmount: number;
  nextPaymentDate: string | null;
  pendingStatusRequestsCount: number;
  recentStatusRequests: Awaited<ReturnType<StatusRequestRepository["listRecentByDriver"]>>;
  openIncidents: Awaited<ReturnType<IncidentRepository["listOpenByDriver"]>>;
}

export interface DriverActiveContractSnapshot {
  id: string;
  contractNumber: string;
  status: string;
  carLabel: string;
  startDate: string;
  plannedEndDate: string;
  totalCost: number;
  paidAmount: number;
  remainingAmount: number;
  installmentAmount: number;
  installmentDay: number;
  currentDebt: number;
}

@Injectable()
export class DriverMobileReadService {
  private readonly carRepository: CarRepository = makeCarRepository();
  private readonly contractRepository: ContractRepository = makeContractRepository();
  private readonly driverCreditBalanceRepository: DriverCreditBalanceRepository = makeDriverCreditBalanceRepository();
  private readonly driverRepository: DriverRepository = makeDriverRepository();
  private readonly incidentRepository: IncidentRepository = makeIncidentRepository();
  private readonly notificationRepository: NotificationRepository = makeNotificationRepository();
  private readonly obligationRepository: ObligationRepository = makeObligationRepository();
  private readonly paymentRepository: PaymentRepository = makePaymentRepository();
  private readonly payoutRepository: PayoutRepository = makePayoutRepository();
  private readonly statusRequestRepository: StatusRequestRepository = makeStatusRequestRepository();
  private readonly statusRequestPolicyService = new DriverStatusRequestPolicyService();
  private readonly yandexBalanceRepository: YandexBalanceRepository = makeYandexBalanceRepository();

  async getFinanceSnapshot(driverId: string): Promise<DriverFinanceSnapshot> {
    const snapshots = await this.getFinanceSnapshots([driverId]);
    return snapshots[driverId] ?? {
      currentDebt: 0,
      creditBalance: 0,
      overdueDebt: 0,
      overdueSinceDate: null,
      overdueUntilDate: null,
      nextPaymentAmount: 0,
      nextPaymentDate: null,
      lastPaymentDate: null,
      yandexBalance: 0,
      reservedPayoutAmount: 0,
    };
  }

  async getDriverHomeSnapshot(driverId: string, userId: string | null): Promise<DriverHomeSnapshot> {
    const [driver, finance, unreadNotifications, contract] = await Promise.all([
      this.driverRepository.getById(driverId),
      this.getFinanceSnapshot(driverId),
      this.notificationRepository.countPendingByDriverOrUser(driverId, userId),
      this.contractRepository.getActiveByDriver(driverId),
    ]);
    const currentStatus = driver
      ? await this.statusRequestPolicyService.getEffectiveCurrentStatus(driver.id, driver.status, this.today())
      : "unknown";

    const creditBalance = await this.driverCreditBalanceRepository.getByDriver(driverId);
    const openObligations = await this.statusRequestPolicyService.listEffectiveOpenObligations(driverId, creditBalance);
    const nextGps = this.nextOpenObligationByType(openObligations, "gps");
    const nextInsurance = this.nextOpenObligationByType(openObligations, "insurance");
    const nextInstallmentWithBreakdown = openObligations.find((item) => item.type === "installment" && item.remainingAmount > 0) ?? null;

    return {
      driverName: driver?.fullName ?? "Неизвестный водитель",
      currentStatus,
      finance,
      monthlyGpsAmount: contract?.monthlyGpsAmount ?? 0,
      monthlyInsuranceAmount: contract?.monthlyInsuranceAmount ?? 0,
      gpsDueAmount: nextGps?.remainingAmount ?? nextInstallmentWithBreakdown?.gpsAmount ?? 0,
      gpsDueDate: nextGps?.effectiveDueDate ?? (nextInstallmentWithBreakdown?.gpsAmount ? nextInstallmentWithBreakdown.effectiveDueDate : null),
      insuranceDueAmount: nextInsurance?.remainingAmount ?? nextInstallmentWithBreakdown?.insuranceAmount ?? 0,
      insuranceDueDate: nextInsurance?.effectiveDueDate ?? (nextInstallmentWithBreakdown?.insuranceAmount ? nextInstallmentWithBreakdown.effectiveDueDate : null),
      unreadNotifications,
    };
  }

  async getDriverProfileSnapshot(driverId: string): Promise<DriverProfileSnapshot | null> {
    const driver = await this.driverRepository.getById(driverId);
    if (!driver) {
      return null;
    }

    const [finance, assignment] = await Promise.all([
      this.getFinanceSnapshot(driverId),
      this.getDriverAssignmentSnapshot(driverId, driver.activeContractId),
    ]);
    const currentStatus = await this.statusRequestPolicyService.getEffectiveCurrentStatus(
      driver.id,
      driver.status,
      this.today(),
    );

    return {
      driverId: driver.id,
      driverName: driver.fullName,
      phone: driver.phone,
      currentStatus,
      assignment,
      managerId: driver.managerId,
      totalObligations: driver.totalObligations,
      totalPaid: driver.totalPaid,
      currentDebt: finance.currentDebt,
      creditBalance: finance.creditBalance,
      overdueDebt: finance.overdueDebt,
      lastPaymentDate: finance.lastPaymentDate,
      yandexBalance: finance.yandexBalance,
    };
  }

  async getDriverDebtSummarySnapshot(driverId: string): Promise<DriverDebtSummary> {
    const finance = await this.getFinanceSnapshot(driverId);

    return {
      driverId,
      totalDebt: finance.currentDebt,
      creditBalance: finance.creditBalance,
      overdueDebt: finance.overdueDebt,
      nextPaymentAmount: finance.nextPaymentAmount,
      nextPaymentDate: finance.nextPaymentDate,
    };
  }

  async getFinanceSnapshots(driverIds: string[]): Promise<Record<string, DriverFinanceSnapshot>> {
    const [debtSnapshots, driverCreditBalances, payments, yandexBalances, reservedPayoutAmounts] = await Promise.all([
      this.obligationRepository.getDebtSnapshotsByDrivers(driverIds, this.today()),
      this.driverCreditBalanceRepository.getByDrivers(driverIds),
      this.paymentRepository.getLatestSuccessfulByDrivers(driverIds),
      this.yandexBalanceRepository.getLatestByDrivers(driverIds),
      this.payoutRepository.getRequestedAmountByDrivers(driverIds),
    ]);

    const effectivePolicies = await Promise.all(
      driverIds.map((driverId) =>
        this.statusRequestPolicyService.getEffectiveDebtPolicy(
          driverId,
          this.today(),
          driverCreditBalances[driverId] ?? 0,
        ),
      ),
    );

    return Object.fromEntries(
      driverIds.map((driverId) => {
        const effectivePolicy = effectivePolicies[driverIds.indexOf(driverId)];
        const debtSnapshot = debtSnapshots[driverId];
        const creditBalance = driverCreditBalances[driverId] ?? 0;
        const currentDebt = Math.max(0, (debtSnapshot?.totalDebt ?? 0) - creditBalance);

        return [
          driverId,
          {
            currentDebt: effectivePolicy?.currentDebt ?? currentDebt,
            creditBalance,
            overdueDebt: effectivePolicy?.overdueDebt ?? debtSnapshot?.overdueDebt ?? 0,
            overdueSinceDate: effectivePolicy ? effectivePolicy.overdueSinceDate : debtSnapshot?.overdueSinceDate ?? null,
            overdueUntilDate: effectivePolicy ? effectivePolicy.overdueUntilDate : debtSnapshot?.overdueUntilDate ?? null,
            nextPaymentAmount: effectivePolicy?.nextPaymentAmount ?? debtSnapshot?.nextPaymentAmount ?? 0,
            nextPaymentDate: effectivePolicy ? effectivePolicy.nextPaymentDate : debtSnapshot?.nextPaymentDate ?? null,
            lastPaymentDate: payments[driverId]?.createdAt ?? null,
            yandexBalance: yandexBalances[driverId]?.amount ?? 0,
            reservedPayoutAmount: reservedPayoutAmounts[driverId] ?? 0,
          },
        ];
      }),
    );
  }

  async getDriverAssignmentSnapshot(
    driverId: string,
    activeContractId: string | null,
  ): Promise<DriverAssignmentSnapshot> {
    const snapshots = await this.getDriverAssignmentSnapshots([
      {
        driverId,
        activeContractId,
      },
    ]);

    return snapshots[driverId] ?? { vehicle: null, contractNumber: null };
  }

  async getDriverAssignmentSnapshots(
    inputs: DriverAssignmentSnapshotInput[],
  ): Promise<Record<string, DriverAssignmentSnapshot>> {
    const driverDetails = await Promise.all(
      inputs.map(async ({ driverId, activeContractId }) => {
        const [car, contract] = await Promise.all([
          this.carRepository.getAssignedByDriver(driverId),
          activeContractId ? this.contractRepository.getById(activeContractId) : Promise.resolve(null),
        ]);

        return {
          driverId,
          car,
          contract,
        };
      }),
    );
    const detailByDriverId = new Map(driverDetails.map((item) => [item.driverId, item]));

    return Object.fromEntries(
      inputs.map(({ driverId }) => {
        const detail = detailByDriverId.get(driverId);

        return [
          driverId,
          {
            vehicle: detail?.car?.plateNumber ?? null,
            vehicleStatus: detail?.car?.status ?? null,
            contractNumber: detail?.contract?.contractNumber ?? null,
          },
        ];
      }),
    );
  }

  async getActiveContractSnapshot(
    driverId: string,
    assignedCarId: string | null,
  ): Promise<DriverActiveContractSnapshot | null> {
    const creditBalance = await this.driverCreditBalanceRepository.getByDriver(driverId);
    const [driver, contract, effectiveObligations] = await Promise.all([
      this.driverRepository.getById(driverId),
      this.contractRepository.getActiveByDriver(driverId),
      this.statusRequestPolicyService.listEffectiveOpenObligations(driverId, creditBalance),
    ]);
    if (!driver || !contract) {
      return null;
    }
    const car = await this.carRepository.getAssignedByDriver(driverId) ?? await this.carRepository.getById(contract.carId);
    const paidAmount = contract.schedule.reduce((sum, item) => sum + item.paidAmount, 0);
    const remainingAmount = effectiveObligations
      .filter((item) => item.contractId === contract.id)
      .reduce((sum, item) => sum + item.remainingAmount, 0);
    const startDate = contract.startDate ?? "";
    const plannedEndDate = contract.endDate ?? (startDate && contract.termMonths ? this.addMonths(startDate, contract.termMonths) : "");

    return {
      id: contract.id,
      contractNumber: contract.contractNumber,
      status: contract.status,
      carLabel: car?.plateNumber ?? assignedCarId ?? contract.carId,
      startDate,
      plannedEndDate,
      totalCost: contract.principalAmount,
      paidAmount,
      remainingAmount,
      installmentAmount: contract.installmentAmount,
      installmentDay: contract.installmentDay,
      currentDebt: Math.max(0, remainingAmount),
    };
  }

  async getDriverActiveContractSnapshot(driverId: string): Promise<DriverActiveContractSnapshot | null> {
    return this.getActiveContractSnapshot(driverId, null);
  }

  async getPaymentSchedule(driverId: string): Promise<DriverPaymentScheduleItem[]> {
    const creditBalance = await this.driverCreditBalanceRepository.getByDriver(driverId);
    const obligations = await this.statusRequestPolicyService.listEffectiveContractObligations(driverId, creditBalance);
    const today = this.today();
    const schedule = obligations
      .slice()
      .map((item) => {
        const isDeferred = item.remainingAmount > 0 && item.effectiveDueDate > item.originalDueDate && today < item.effectiveDueDate;

        return {
          id: item.id,
          dueDate: item.effectiveDueDate,
          originalDueDate: item.originalDueDate,
          amount: item.amount,
          paidAmount: item.paidAmount,
          type: item.type,
          deferredByStatusRequest: !!item.deferredByStatusRequestId,
          status: item.remainingAmount <= 0
            ? "paid"
            : isDeferred
              ? "deferred"
              : item.effectiveDueDate < today
                ? "overdue"
              : item.paidAmount > 0
                ? "partial"
                : "planned",
        };
      });

    return schedule;
  }

  getDriverPayouts(driverId: string): Promise<PayoutListItem[]> {
    return this.payoutRepository.listByDriver(driverId);
  }

  private nextOpenObligationByType(
    obligations: Array<{ type: string; remainingAmount: number; effectiveDueDate: string }>,
    type: "insurance" | "gps",
  ) {
    return obligations.find((item) => item.type === type && item.remainingAmount > 0) ?? null;
  }

  async getDriverPaymentStatement(driverId: string): Promise<DriverPaymentStatementItem[]> {
    const payments = await this.paymentRepository.listByDriver(driverId);
    return payments.map((payment) => ({
      id: payment.id,
      driverId: payment.driverId,
      contractId: payment.contractId,
      amount: payment.amount,
      appliedAmount: payment.appliedAmount,
      unappliedAmount: payment.unappliedAmount,
      status: payment.status,
      provider: payment.provider,
      paymentForDate: payment.paymentForDate ?? null,
      createdAt: payment.createdAt,
    }));
  }

  listDriverStatusRequests(driverId: string): Promise<DriverStatusRequestItem[]> {
    return this.statusRequestRepository.listByDriver(driverId);
  }

  async getNextPayment(driverId: string) {
    const creditBalance = await this.driverCreditBalanceRepository.getByDriver(driverId);
    return this.statusRequestPolicyService.getEffectiveNextOpen(driverId, creditBalance);
  }

  listRecentStatusRequests(driverId: string, limit: number) {
    return this.statusRequestRepository.listRecentByDriver(driverId, limit);
  }

  getPendingStatusRequestsCount(driverIds: string[]): Promise<number> {
    return this.statusRequestRepository.countPendingByDrivers(driverIds);
  }

  getPendingStatusRequestsCountByDriver(driverId: string): Promise<number> {
    return this.statusRequestRepository.countPendingByDriver(driverId);
  }

  async getDueTodayAmount(driverId: string, date: string): Promise<number> {
    const creditBalance = await this.driverCreditBalanceRepository.getByDriver(driverId);
    return this.statusRequestPolicyService.getEffectiveDueAmountOnDate(driverId, date, creditBalance);
  }

  countOpenIncidents(): Promise<number> {
    return this.incidentRepository.countOpen();
  }

  countOpenIncidentsByDrivers(driverIds: string[]): Promise<number> {
    return this.incidentRepository.countOpenByDrivers(driverIds);
  }

  listOpenIncidentsByDriver(driverId: string) {
    return this.incidentRepository.listOpenByDriver(driverId);
  }

  async getManagerDriversSummary(driverIds: string[], date: string): Promise<ManagerDriversSummarySnapshot> {
    const [financeSnapshots, dueTodayAmount, pendingStatusRequests, openIncidents] = await Promise.all([
      this.getFinanceSnapshots(driverIds),
      this.obligationRepository.getDueAmountByDriversOnDate(driverIds, date),
      this.getPendingStatusRequestsCount(driverIds),
      this.countOpenIncidentsByDrivers(driverIds),
    ]);

    return {
      overdueDrivers: Object.values(financeSnapshots).filter((item) => item.overdueDebt > 0).length,
      paymentDueDrivers: Object.values(financeSnapshots).filter((item) => this.isPaymentDue(item, date)).length,
      dueTodayAmount,
      pendingStatusRequests,
      openIncidents,
    };
  }

  private isPaymentDue(finance: DriverFinanceSnapshot, date: string): boolean {
    if (finance.overdueDebt > 0) {
      return true;
    }

    return (
      finance.nextPaymentAmount > 0
      && typeof finance.nextPaymentDate === "string"
      && finance.nextPaymentDate <= date
    );
  }

  async getManagerDriverDetailSnapshot(
    driverId: string,
    activeContractId: string | null,
  ): Promise<ManagerDriverDetailSnapshot> {
    const [assignment, finance, nextPayment, pendingStatusRequestsCount, recentStatusRequests, openIncidents] =
      await Promise.all([
        this.getDriverAssignmentSnapshot(driverId, activeContractId),
        this.getFinanceSnapshot(driverId),
        this.getNextPayment(driverId),
        this.getPendingStatusRequestsCountByDriver(driverId),
        this.listRecentStatusRequests(driverId, 3),
        this.listOpenIncidentsByDriver(driverId),
      ]);

    return {
      assignment,
      finance,
      nextPaymentAmount: nextPayment ? nextPayment.amount - nextPayment.paidAmount : 0,
      nextPaymentDate: nextPayment?.dueDate ?? null,
      pendingStatusRequestsCount,
      recentStatusRequests,
      openIncidents,
    };
  }

  private addMonths(date: string, months: number): string {
    const source = new Date(`${date}T00:00:00.000Z`);
    source.setUTCMonth(source.getUTCMonth() + months);
    return source.toISOString().slice(0, 10);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
}
