import { Injectable } from "@nestjs/common";
import {
  makeDriverRepository,
  makeObligationRepository,
  makeStatusRequestRepository,
} from "../../common/application/repository.factory.js";
import type {
  DriverRepository,
  ObligationRepository,
  StatusRequestRepository,
} from "../../common/repositories/index.js";
import type { ObligationListItem, StatusRequestType } from "@gopark/contracts";
import {
  parseDriverStatusRequestPeriod,
  type DriverStatusRequestPeriodRange,
} from "./driver-status-request-period.js";

type ApprovedPeriodRange = DriverStatusRequestPeriodRange & {
  type: StatusRequestType;
};

export interface DriverEffectiveDebtPolicySnapshot {
  currentDebt: number;
  overdueDebt: number;
  nextPaymentAmount: number;
  nextPaymentDate: string | null;
}

export interface DriverEffectiveObligationSnapshot extends ObligationListItem {
  originalDueDate: string;
  effectiveDueDate: string;
  remainingAmount: number;
}

export type DriverEffectiveStatus = "active" | "day_off" | "vacation" | "force_majeure" | string;

@Injectable()
export class DriverStatusRequestPolicyService {
  private readonly driverRepository: DriverRepository = makeDriverRepository();
  private readonly obligationRepository: ObligationRepository = makeObligationRepository();
  private readonly statusRequestRepository: StatusRequestRepository = makeStatusRequestRepository();

  async getEffectiveDebtPolicy(
    driverId: string,
    asOfDate: string,
    creditBalance = 0,
  ): Promise<DriverEffectiveDebtPolicySnapshot> {
    const openObligations = await this.listEffectiveOpenObligations(driverId, creditBalance);
    const next = openObligations.find((item) => item.remainingAmount > 0) ?? null;
    const overdueDebt = openObligations
      .filter((item) => item.remainingAmount > 0 && item.effectiveDueDate < asOfDate)
      .reduce((sum, item) => sum + item.remainingAmount, 0);

    return {
      currentDebt: openObligations.reduce((sum, item) => sum + item.remainingAmount, 0),
      overdueDebt,
      nextPaymentAmount: next?.remainingAmount ?? 0,
      nextPaymentDate: next?.effectiveDueDate ?? null,
    };
  }

  async getEffectiveDueAmountOnDate(driverId: string, date: string, creditBalance = 0): Promise<number> {
    const obligations = await this.listEffectiveOpenObligations(driverId, creditBalance);

    return obligations
      .filter((item) => item.remainingAmount > 0 && item.effectiveDueDate === date)
      .reduce((sum, item) => sum + item.remainingAmount, 0);
  }

  async isDateCoveredByApprovedPeriod(driverId: string, date: string): Promise<boolean> {
    const approvedPeriods = await this.listApprovedPeriods(driverId);
    return this.isCoveredByApprovedPeriod(date, approvedPeriods);
  }

  async getEffectiveNextOpen(driverId: string, creditBalance = 0): Promise<ObligationListItem | null> {
    const next = (await this.listEffectiveOpenObligations(driverId, creditBalance))
      .find((item) => item.remainingAmount > 0) ?? null;

    return next ? this.toObligationListItem(next) : null;
  }

  async listEffectiveOpenObligations(
    driverId: string,
    creditBalance = 0,
  ): Promise<DriverEffectiveObligationSnapshot[]> {
    return this.listEffectiveObligations(driverId, creditBalance, { includePaid: false });
  }

  async listEffectiveContractObligations(
    driverId: string,
    creditBalance = 0,
  ): Promise<DriverEffectiveObligationSnapshot[]> {
    return this.listEffectiveObligations(driverId, creditBalance, { includePaid: true });
  }

  private async listEffectiveObligations(
    driverId: string,
    creditBalance: number,
    options: { includePaid: boolean },
  ): Promise<DriverEffectiveObligationSnapshot[]> {
    const [driver, obligations, approvedPeriods] = await Promise.all([
      this.driverRepository.getById(driverId),
      this.obligationRepository.listByDriver(driverId),
      this.listApprovedPeriods(driverId),
    ]);
    const activeContractId = driver?.activeContractId ?? null;
    const scopedObligations = activeContractId
      ? obligations.filter((item) => item.contractId === activeContractId)
      : [];

    return this.buildEffectiveObligations(scopedObligations, approvedPeriods, creditBalance, options);
  }

  async getEffectiveCurrentStatus(
    driverId: string,
    baseStatus: string,
    asOfDate: string,
  ): Promise<DriverEffectiveStatus> {
    if (baseStatus !== "active") {
      return baseStatus;
    }

    const approvedPeriods = await this.listApprovedPeriods(driverId);
    const coveringPeriods = approvedPeriods.filter((item) => item.startDate <= asOfDate && asOfDate <= item.endDate);
    const coveringTypes = coveringPeriods.map((item) => item.type);

    if (coveringTypes.includes("force_majeure")) {
      return "force_majeure";
    }

    if (coveringTypes.includes("vacation")) {
      return "vacation";
    }

    if (coveringTypes.includes("day_off")) {
      return "day_off";
    }

    return baseStatus;
  }

  async getEffectiveCurrentStatuses(
    drivers: Array<{ id: string; status: string }>,
    asOfDate: string,
  ): Promise<Record<string, DriverEffectiveStatus>> {
    const requests = await this.statusRequestRepository.listByDrivers(drivers.map((driver) => driver.id));
    const requestsByDriverId = new Map<string, typeof requests>();

    for (const driver of drivers) {
      requestsByDriverId.set(driver.id, []);
    }

    for (const item of requests) {
      if (!item.driverId) {
        continue;
      }

      requestsByDriverId.get(item.driverId)?.push(item);
    }

    const statuses = drivers.map((driver) => {
      if (driver.status !== "active") {
        return driver.status;
      }

      const approvedPeriods = this.toApprovedPeriods(
        (requestsByDriverId.get(driver.id) ?? []).filter((item) => item.status === "approved"),
      );
      const coveringPeriods = approvedPeriods.filter((item) => item.startDate <= asOfDate && asOfDate <= item.endDate);
      const coveringTypes = coveringPeriods.map((item) => item.type);

      if (coveringTypes.includes("force_majeure")) {
        return "force_majeure";
      }

      if (coveringTypes.includes("vacation")) {
        return "vacation";
      }

      if (coveringTypes.includes("day_off")) {
        return "day_off";
      }

      return driver.status;
    });

    return Object.fromEntries(
      drivers.map((driver, index) => [driver.id, statuses[index]]),
    );
  }

  private async listApprovedPeriods(driverId: string): Promise<ApprovedPeriodRange[]> {
    const approvedRequests = (await this.statusRequestRepository.listByDriver(driverId))
      .filter((item) => item.status === "approved");
    return this.toApprovedPeriods(approvedRequests);
  }

  private toApprovedPeriods(
    approvedRequests: Array<{ period: string; type: StatusRequestType }>,
  ): ApprovedPeriodRange[] {
    const periods: ApprovedPeriodRange[] = [];

    for (const item of approvedRequests) {
      const period = parseDriverStatusRequestPeriod(item.period);
      if (!period) {
        continue;
      }

      periods.push({
        ...period,
        type: item.type,
      });
    }

    return periods;
  }

  private isMarkedDeferred(item: ObligationListItem, asOfDate: string): boolean {
    return !!item.deferredUntil && asOfDate <= item.deferredUntil;
  }

  private buildEffectiveObligations(
    obligations: ObligationListItem[],
    approvedPeriods: ApprovedPeriodRange[],
    creditBalance: number,
    options: { includePaid: boolean },
  ): DriverEffectiveObligationSnapshot[] {
    let remainingCredit = Math.max(0, creditBalance);

    return obligations
      .filter((item) => options.includePaid || this.getOpenAmount(item) > 0)
      .slice()
      .sort((a, b) => this.getEffectiveDueDate(a, approvedPeriods).localeCompare(this.getEffectiveDueDate(b, approvedPeriods)))
      .map((item) => {
        const openAmount = this.getOpenAmount(item);
        const creditApplied = Math.min(openAmount, remainingCredit);
        remainingCredit -= creditApplied;
        const paidAmount = item.paidAmount + creditApplied;
        const effectiveDueDate = this.getEffectiveDueDate(item, approvedPeriods);

        return {
          ...item,
          originalDueDate: item.dueDate,
          dueDate: effectiveDueDate,
          effectiveDueDate,
          paidAmount,
          remainingAmount: Math.max(0, openAmount - creditApplied),
        };
      });
  }

  private getOpenAmount(item: ObligationListItem): number {
    if (item.type !== "installment") {
      return Math.max(0, item.amount - item.paidAmount);
    }

    const installmentAmount = item.installmentAmount ?? item.amount;
    const paidTowardInstallment = Math.min(Math.max(0, item.paidAmount), installmentAmount);
    return Math.max(0, installmentAmount - paidTowardInstallment);
  }

  private toObligationListItem(item: DriverEffectiveObligationSnapshot): ObligationListItem {
    return {
      id: item.id,
      driverId: item.driverId,
      contractId: item.contractId,
      type: item.type,
      amount: item.amount,
      paidAmount: item.paidAmount,
      installmentAmount: item.installmentAmount ?? null,
      gpsAmount: item.gpsAmount ?? null,
      insuranceAmount: item.insuranceAmount ?? null,
      dueDate: item.effectiveDueDate,
      deferredUntil: item.deferredUntil ?? null,
      deferredByStatusRequestId: item.deferredByStatusRequestId ?? null,
    };
  }

  private getEffectiveDueDate(item: ObligationListItem, approvedPeriods: ApprovedPeriodRange[]): string {
    if (item.deferredUntil) {
      return this.addDays(item.deferredUntil, 1);
    }

    const coveringPeriod = approvedPeriods.find((period) => period.startDate <= item.dueDate && item.dueDate <= period.endDate);
    if (coveringPeriod) {
      return this.addDays(coveringPeriod.endDate, 1);
    }

    return item.dueDate;
  }

  private isCoveredByApprovedPeriod(date: string, approvedPeriods: ApprovedPeriodRange[]): boolean {
    return approvedPeriods.some((item) => item.startDate <= date && date <= item.endDate);
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private addDays(date: string, days: number): string {
    const next = new Date(`${date}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + days);
    return next.toISOString().slice(0, 10);
  }
}
