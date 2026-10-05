export interface CreateCarDto {
  vin: string;
  plateNumber: string;
  make: string;
  model: string;
  companyName?: string;
  productionYear?: number;
  mileage?: number;
  osagoStartDate?: string;
  osagoEndDate?: string;
  cascoStartDate?: string;
  cascoEndDate?: string;
  technicalInspectionStartDate?: string;
  technicalInspectionEndDate?: string;
  engineOilReplacementKm?: number;
  gearboxOilReplacementKm?: number;
  color?: string;
  purchasePrice?: number;
  customsCost?: number;
  deliveryCost?: number;
  repairCost?: number;
  targetSalePrice?: number;
}
