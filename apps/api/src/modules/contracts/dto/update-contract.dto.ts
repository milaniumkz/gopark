import type { ContractListItem } from "@gopark/contracts";

export class UpdateContractDto {
  contractNumber?: string;
  principalAmount?: number;
  financedAmount?: number;
  installmentAmount?: number;
  monthlyInsuranceAmount?: number | null;
  monthlyGpsAmount?: number | null;
  installmentDay?: number;
  termMonths?: number;
  startDate?: string;
  endDate?: string | null;
  status?: ContractListItem["status"];
}
