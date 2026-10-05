export interface CreateContractDto {
  driverId: string;
  carId: string;
  contractNumber: string;
  principalAmount: number;
  financedAmount: number;
  installmentAmount: number;
  monthlyInsuranceAmount?: number;
  monthlyGpsAmount?: number;
  insuranceBillingMode?: "monthly" | "daily";
  gpsBillingMode?: "monthly" | "daily";
  handoverMileage?: number;
  hasOsago?: boolean;
  osagoStartDate?: string;
  hasCasco?: boolean;
  cascoStartDate?: string;
  installmentDay?: number;
  termMonths: number;
  startDate: string;
  endDate: string;
}
