import { Injectable } from "@nestjs/common";
import type { DashboardOverview, DashboardSummary } from "@gopark/contracts";
import {
  makeCarRepository,
  makeDriverRepository,
  makeIncidentRepository,
  makeObligationRepository,
  makePaymentRepository,
  makePayoutRepository,
} from "../../common/application/repository.factory.js";
import type {
  CarRepository,
  DriverRepository,
  IncidentRepository,
  ObligationRepository,
  PaymentRepository,
  PayoutRepository,
} from "../../common/repositories/index.js";
import { DriverStatusRequestPolicyService } from "../mobile-read/driver-status-request-policy.service.js";

@Injectable()
export class DashboardService {
  private readonly driverRepository: DriverRepository = makeDriverRepository();
  private readonly carRepository: CarRepository = makeCarRepository();
  private readonly incidentRepository: IncidentRepository = makeIncidentRepository();
  private readonly obligationRepository: ObligationRepository = makeObligationRepository();
  private readonly paymentRepository: PaymentRepository = makePaymentRepository();
  private readonly payoutRepository: PayoutRepository = makePayoutRepository();
  private readonly statusRequestPolicyService = new DriverStatusRequestPolicyService();

  async getSummary(companyName?: string | null): Promise<DashboardSummary> {
    const [drivers, cars, pendingPayouts] = await Promise.all([
      companyName ? this.driverRepository.listByCompany(companyName) : this.driverRepository.list(),
      companyName ? this.carRepository.listByCompany(companyName) : this.carRepository.list(),
      companyName ? this.payoutRepository.listByCompany(companyName) : this.payoutRepository.list(),
    ]);
    const scopedDrivers = drivers;
    const scopedCars = cars;
    const effectiveStatuses = await this.statusRequestPolicyService.getEffectiveCurrentStatuses(
      scopedDrivers.map((driver) => ({ id: driver.id, status: driver.status })),
      this.today(),
    );

    const workingDriverIds = this.getWorkingDriverIds(scopedCars, effectiveStatuses);
    const debtTotal = await this.obligationRepository.getTotalDebtByDrivers(workingDriverIds);

    return {
      activeDrivers: scopedDrivers.filter((item) => effectiveStatuses[item.id] === "active").length,
      activeCars: scopedCars.filter((item) => item.status === "assigned").length,
      debtTotal,
      pendingPayouts: pendingPayouts.filter((item) => item.status === "requested").length,
    };
  }

  async getOverview(
    period: "today" | "week" | "month" | "year",
    companyName?: string | null,
    startDate?: string | null,
    endDate?: string | null,
  ): Promise<DashboardOverview> {
    const [scopedDrivers, scopedCars, incidents] = await Promise.all([
      companyName ? this.driverRepository.listByCompany(companyName) : this.driverRepository.list(),
      companyName ? this.carRepository.listByCompany(companyName) : this.carRepository.list(),
      companyName ? this.incidentRepository.listByCompany(companyName) : this.incidentRepository.list(),
    ]);
    const effectiveStatuses = await this.statusRequestPolicyService.getEffectiveCurrentStatuses(
      scopedDrivers.map((driver) => ({ id: driver.id, status: driver.status })),
      this.today(),
    );
    const periodRange = this.getPeriodRange(period, startDate, endDate);
    const scopedDriverIds = scopedDrivers.map((driver) => driver.id);
    const [debtBase, plannedPaymentBase, payments, paidObligationsCount, unpaidObligationsCount] = await Promise.all([
      companyName
        ? this.obligationRepository.getOpenDueByCompanyInPeriod(companyName, periodRange.startDate, periodRange.endDate)
        : this.obligationRepository.getOpenDueByDriversInPeriod(scopedDriverIds, periodRange.startDate, periodRange.endDate),
      companyName
        ? this.obligationRepository.getTotalDueByCompanyInPeriod(companyName, periodRange.startDate, periodRange.endDate)
        : this.obligationRepository.getTotalDueByDriversInPeriod(scopedDriverIds, periodRange.startDate, periodRange.endDate),
      companyName ? this.paymentRepository.listByCompany(companyName) : this.paymentRepository.list(),
      companyName ? this.obligationRepository.countPaidByCompany(companyName) : this.obligationRepository.countPaidByDrivers(scopedDriverIds),
      companyName ? this.obligationRepository.countUnpaidByCompany(companyName) : this.obligationRepository.countUnpaidByDrivers(scopedDriverIds),
    ]);
    const actualPaymentBase = payments
      .filter((item) => {
        const paymentDate = (item.paymentForDate ?? item.createdAt).slice(0, 10);
        return item.status === "succeeded" && paymentDate >= periodRange.startDate && paymentDate <= periodRange.endDate;
      })
      .reduce((sum, item) => sum + item.appliedAmount, 0);
    const driverStatusCounts = scopedDrivers.reduce<Record<string, number>>((acc, item) => {
      const effectiveStatus = effectiveStatuses[item.id] ?? item.status;
      acc[effectiveStatus] = (acc[effectiveStatus] ?? 0) + 1;
      return acc;
    }, {});
    const vehicleStatusCounts = scopedCars.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] ?? 0) + 1;
      return acc;
    }, {});
    const openAccidentKeys = new Set(
      incidents
        .filter((item) => item.status === "open" && (item.incidentType === "accident" || item.title.toLowerCase().includes("дтп")))
        .map((item) => item.carId ?? item.driverId ?? item.id),
    );

    return {
      plannedPayment: plannedPaymentBase,
      actualPayment: actualPaymentBase,
      debt: debtBase,
      overpayment: Math.max(actualPaymentBase - plannedPaymentBase, 0),
      drivers: {
        total: scopedDrivers.length,
        active: driverStatusCounts.active ?? 0,
        paid: paidObligationsCount,
        unpaid: unpaidObligationsCount,
        dayoff: driverStatusCounts.day_off ?? 0,
        vacation: driverStatusCounts.vacation ?? 0,
      },
      vehicles: {
        installment: vehicleStatusCounts.assigned ?? 0,
        office: (vehicleStatusCounts.office ?? 0) + (vehicleStatusCounts.free ?? 0),
        customs: vehicleStatusCounts.customs ?? 0,
        accident: Math.max(vehicleStatusCounts.accident ?? 0, openAccidentKeys.size),
        idle: vehicleStatusCounts.idle ?? 0,
        writtenOff: vehicleStatusCounts.written_off ?? 0,
        sold: vehicleStatusCounts.sold ?? 0,
      },
    };
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private getPeriodRange(
    period: "today" | "week" | "month" | "year",
    startDate?: string | null,
    endDate?: string | null,
  ): { startDate: string; endDate: string } {
    if (this.isDateOnly(startDate)) {
      return {
        startDate,
        endDate: this.isDateOnly(endDate) ? endDate : startDate,
      };
    }

    const start = new Date(`${this.today()}T00:00:00.000Z`);
    const end = new Date(start);
    const days = period === "today" ? 0 : period === "week" ? 6 : period === "month" ? 29 : 364;
    end.setUTCDate(end.getUTCDate() + days);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }

  private isDateOnly(value?: string | null): value is string {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
  }

  private getWorkingDriverIds(
    cars: Awaited<ReturnType<CarRepository["list"]>>,
    effectiveStatuses: Record<string, string>,
  ): string[] {
    return cars
      .filter((car) => (
        car.status === "assigned"
        && !!car.assignedDriverId
        && effectiveStatuses[car.assignedDriverId] === "active"
      ))
      .map((car) => car.assignedDriverId as string);
  }
}
