export interface CreatePaymentDto {
  driverId: string;
  contractId: string;
  amount: number;
  provider: string;
  paymentForDate?: string | null;
  paymentType?: "installment" | "insurance" | "gps";
}
