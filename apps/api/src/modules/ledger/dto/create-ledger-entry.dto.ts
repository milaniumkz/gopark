export interface CreateLedgerEntryDto {
  accountId: string;
  contractId?: string;
  driverId?: string;
  type: "obligation" | "payment" | "adjustment" | "payout" | "refund" | "penalty";
  amount: string;
  externalReference?: string;
}

