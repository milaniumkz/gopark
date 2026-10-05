export interface ContractListItem {
  id: string;
  driverId: string;
  carId: string;
  status: string;
  contractNumber: string;
  financedAmount: number;
  installmentAmount: number;
  monthlyInsuranceAmount?: number | null;
  monthlyGpsAmount?: number | null;
  insuranceBillingMode?: "monthly" | "daily";
  gpsBillingMode?: "monthly" | "daily";
  handoverMileage?: number | null;
  hasOsago?: boolean;
  osagoStartDate?: string | null;
  osagoEndDate?: string | null;
  hasCasco?: boolean;
  cascoStartDate?: string | null;
  cascoEndDate?: string | null;
  termMonths?: number;
  startDate?: string;
  endDate?: string | null;
  endedAt?: string | null;
  currentDebt: number;
  overdueDebt?: number;
  overdueSinceDate?: string | null;
  overdueUntilDate?: string | null;
  nextDueDate?: string | null;
  nextDueAmount?: number;
  hasDeferredPayment?: boolean;
}

export interface ContractDetail extends ContractListItem {
  principalAmount: number;
  installmentDay: number;
  schedule: ObligationListItem[];
}

export interface PaymentListItem {
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

export const paymentCalendarDayOverrideStatuses = [
  "day_off",
  "asked_leave",
  "sick",
  "repair",
  "accident",
  "other",
] as const;

export type PaymentCalendarDayOverrideStatus = typeof paymentCalendarDayOverrideStatuses[number];

export interface PaymentCalendarDayOverrideItem {
  id: string;
  driverId: string;
  date: string;
  status: PaymentCalendarDayOverrideStatus;
  note?: string | null;
  updatedByUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertPaymentCalendarDayOverrideDto {
  driverId: string;
  date: string;
  status: PaymentCalendarDayOverrideStatus;
  note?: string | null;
}

export interface ClearPaymentCalendarDayOverrideDto {
  driverId: string;
  date: string;
}

export interface PayoutListItem {
  id: string;
  driverId: string;
  amount: number;
  status: string;
  createdAt: string;
  approvedByUserId?: string;
  payoutDestination?: string | null;
}

export interface ObligationListItem {
  id: string;
  driverId: string;
  contractId: string;
  type: string;
  amount: number;
  paidAmount: number;
  installmentAmount?: number | null;
  gpsAmount?: number | null;
  insuranceAmount?: number | null;
  dueDate: string;
  deferredUntil?: string | null;
  deferredByStatusRequestId?: string | null;
}

export const statusRequestTypes = [
  "day_off",
  "vacation",
  "force_majeure",
] as const;

export type StatusRequestType = typeof statusRequestTypes[number];

export const notificationChannels = ["push", "sms", "in_app"] as const;

export type NotificationChannel = typeof notificationChannels[number];

export const notificationTemplates = [
  "payout_requested",
  "payout_approved",
  "payout_rejected",
  "payment_registered",
  "status_request_created",
  "status_request_approved",
  "status_request_rejected",
  "chat_message_received",
  "inspection_reminder",
] as const;

export type NotificationTemplate = typeof notificationTemplates[number];

export interface NotificationListItem {
  id: string;
  userId?: string;
  driverId?: string;
  channel: NotificationChannel;
  template: NotificationTemplate;
  status: string;
  createdAt?: string;
}
