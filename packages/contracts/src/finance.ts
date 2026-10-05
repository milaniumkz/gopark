export type LedgerEntryType =
  | "obligation"
  | "payment"
  | "adjustment"
  | "payout"
  | "refund"
  | "penalty";

export interface Money {
  amount: string;
  currency: "KGS";
}

export interface LedgerEntry {
  id: string;
  accountId: string;
  contractId: string | null;
  driverId: string | null;
  type: LedgerEntryType;
  money: Money;
  postedAt: string;
  externalReference?: string;
}

export interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actorUserId?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  correlationId: string;
  createdAt: string;
}

export interface DriverCreditWriteoffResult {
  driverId: string;
  amountWrittenOff: number;
  remainingCreditBalance: number;
  reason: string | null;
  createdAt: string;
}

export interface ContractEarlyPayoffResult {
  paymentId: string | null;
  contractId: string;
  driverId: string;
  amount: number;
  appliedAmount: number;
  unappliedAmount: number;
  contractStatus: string;
  remainingContractDebt: number;
  createdAt: string;
}
