import type { StatusRequestType } from "./contracts.js";

export interface DriverDebtSummary {
  driverId: string;
  totalDebt: number;
  creditBalance: number;
  overdueDebt: number;
  nextPaymentAmount: number;
  nextPaymentDate: string | null;
}

export interface DriverHomeSummary {
  driverId: string;
  driverName: string;
  currentStatus: string;
  currentDebt: number;
  creditBalance: number;
  overdueDebt: number;
  nextPaymentAmount: number;
  nextPaymentDate: string | null;
  monthlyGpsAmount: number;
  monthlyInsuranceAmount: number;
  gpsDueAmount: number;
  gpsDueDate: string | null;
  insuranceDueAmount: number;
  insuranceDueDate: string | null;
  yandexBalance: number;
  availableToWithdraw: number;
  unreadNotifications: number;
  photoUrl?: string | null;
  photoStatus?: "missing" | "pending" | "approved" | "rejected" | string;
  photoReviewNote?: string | null;
}

export interface DriverProfileSummary {
  driverId: string;
  driverName: string;
  phone: string;
  currentStatus: string;
  assignedVehicle: string | null;
  activeContractNumber: string | null;
  managerId: string | null;
  totalObligations: number;
  totalPaid: number;
  currentDebt: number;
  creditBalance: number;
  overdueDebt: number;
  lastPaymentDate: string | null;
  yandexBalance: number;
  photoUrl?: string | null;
  photoStatus?: "missing" | "pending" | "approved" | "rejected" | string;
  photoUploadedAt?: string | null;
  photoReviewedAt?: string | null;
  photoReviewNote?: string | null;
}

export interface DriverActiveContractSummary {
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

export interface DriverPayoutRequest {
  amount: number;
  payoutDestination?: string | null;
}

export interface DriverFakeBankPaymentRequest {
  amount?: number;
  paymentType?: "installment" | "insurance" | "gps";
}

export interface DriverStatusRequestItem {
  id: string;
  driverId?: string;
  type: StatusRequestType;
  status: string;
  period: string;
  note?: string | null;
  createdAt?: string;
}

export interface DriverNotificationItem {
  id: string;
  userId?: string;
  driverId?: string;
  channel: string;
  template: string;
  status: string;
  createdAt?: string;
}

export interface DriverCreateStatusRequest {
  type: StatusRequestType;
  period: string;
  note?: string | null;
}

export interface DriverPaymentScheduleItem {
  id: string;
  dueDate: string;
  originalDueDate?: string | null;
  amount: number;
  paidAmount: number;
  installmentAmount?: number | null;
  gpsAmount?: number | null;
  insuranceAmount?: number | null;
  type: string;
  status: string;
  deferredByStatusRequest?: boolean;
}

export interface DriverPaymentStatementItem {
  id: string;
  driverId: string;
  contractId: string;
  amount: number;
  appliedAmount: number;
  unappliedAmount: number;
  status: string;
  provider: string;
  paymentForDate?: string | null;
  createdAt: string;
}
