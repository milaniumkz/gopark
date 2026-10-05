import type { PaymentListItem } from "@gopark/contracts";
import type { CreatePaymentDto } from "../../modules/payments/dto/create-payment.dto.js";

export interface CreatePaymentRecordInput extends CreatePaymentDto {
  appliedAmount: number;
  unappliedAmount: number;
}

export interface PaymentRepository {
  list(): Promise<PaymentListItem[]>;
  listByCompany(companyName: string): Promise<PaymentListItem[]>;
  listByDriver(driverId: string): Promise<PaymentListItem[]>;
  getLatestSuccessfulByDriver(driverId: string): Promise<PaymentListItem | null>;
  getLatestSuccessfulByDrivers(driverIds: string[]): Promise<Record<string, PaymentListItem | null>>;
  create(input: CreatePaymentRecordInput): Promise<PaymentListItem>;
}
