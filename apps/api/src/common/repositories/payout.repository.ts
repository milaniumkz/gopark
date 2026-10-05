import type { PayoutListItem } from "@gopark/contracts";
import type { CreatePayoutDto } from "../../modules/payouts/dto/create-payout.dto.js";

export interface ApprovePayoutInput {
  approvedByUserId: string;
}

export interface PayoutRepository {
  list(): Promise<PayoutListItem[]>;
  listByCompany(companyName: string): Promise<PayoutListItem[]>;
  listByDriver(driverId: string): Promise<PayoutListItem[]>;
  getById(payoutId: string): Promise<PayoutListItem | null>;
  countRequested(): Promise<number>;
  getRequestedAmountByDriver(driverId: string): Promise<number>;
  getRequestedAmountByDrivers(driverIds: string[]): Promise<Record<string, number>>;
  create(input: CreatePayoutDto): Promise<PayoutListItem>;
  approve(payoutId: string, input: ApprovePayoutInput): Promise<PayoutListItem | null>;
  reject(payoutId: string, input: ApprovePayoutInput): Promise<PayoutListItem | null>;
}
