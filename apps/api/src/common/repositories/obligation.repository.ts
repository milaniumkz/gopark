import type { ObligationListItem } from "@gopark/contracts";

export interface ObligationDebtSnapshot {
  totalDebt: number;
  overdueDebt: number;
  overdueSinceDate: string | null;
  overdueUntilDate: string | null;
  nextPaymentAmount: number;
  nextPaymentDate: string | null;
}

export interface ObligationRepository {
  listByDriver(driverId: string): Promise<ObligationListItem[]>;
  getDebtSnapshotsByDrivers(driverIds: string[], asOfDate?: string): Promise<Record<string, ObligationDebtSnapshot>>;
  getDebtSnapshotsByCompany(companyName: string, asOfDate?: string): Promise<Record<string, ObligationDebtSnapshot>>;
  getTotalDueByDrivers(driverIds: string[]): Promise<number>;
  getTotalDueByCompany(companyName: string): Promise<number>;
  getTotalDueByDriversInPeriod(driverIds: string[], startDate: string, endDate: string): Promise<number>;
  getTotalDueByCompanyInPeriod(companyName: string, startDate: string, endDate: string): Promise<number>;
  getOpenDueByDriversInPeriod(driverIds: string[], startDate: string, endDate: string): Promise<number>;
  getOpenDueByCompanyInPeriod(companyName: string, startDate: string, endDate: string): Promise<number>;
  getOpenDueByDriverInPeriod(driverId: string, startDate: string, endDate: string): Promise<number>;
  getTotalPaidByDrivers(driverIds: string[]): Promise<number>;
  getTotalPaidByCompany(companyName: string): Promise<number>;
  getTotalPaidByDriversInPeriod(driverIds: string[], startDate: string, endDate: string): Promise<number>;
  getTotalPaidByCompanyInPeriod(companyName: string, startDate: string, endDate: string): Promise<number>;
  getTotalDebtByDrivers(driverIds: string[]): Promise<number>;
  getTotalDebtByCompany(companyName: string): Promise<number>;
  getOverdueAmountByDrivers(driverIds: string[], asOfDate?: string): Promise<number>;
  getOverdueAmountByCompany(companyName: string, asOfDate?: string): Promise<number>;
  countPaidByDrivers(driverIds: string[]): Promise<number>;
  countPaidByCompany(companyName: string): Promise<number>;
  countUnpaidByDrivers(driverIds: string[]): Promise<number>;
  countUnpaidByCompany(companyName: string): Promise<number>;
  getOverdueAmountByDriver(driverId: string, asOfDate?: string): Promise<number>;
  getDueAmountByDriverOnDate(driverId: string, date: string): Promise<number>;
  getDueAmountByDriversOnDate(driverIds: string[], date: string): Promise<number>;
  getNextOpenByDriver(driverId: string): Promise<ObligationListItem | null>;
  applyPayment(
    driverId: string,
    contractId: string,
    amount: number,
    paymentForDate?: string | null,
    obligationType?: "installment" | "insurance" | "gps",
  ): Promise<ObligationListItem[]>;
  deferByStatusRequest(
    requestId: string,
    driverId: string,
    startDate: string,
    endDate: string,
  ): Promise<ObligationListItem[]>;
  clearDeferredByStatusRequest(requestId: string): Promise<ObligationListItem[]>;
}
