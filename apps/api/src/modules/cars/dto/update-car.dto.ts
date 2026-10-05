export class UpdateCarDto {
  plateNumber?: string;
  vin?: string;
  make?: string;
  model?: string;
  companyName?: string | null;
  productionYear?: number;
  mileage?: number;
  osagoStartDate?: string | null;
  osagoEndDate?: string | null;
  cascoStartDate?: string | null;
  cascoEndDate?: string | null;
  technicalInspectionStartDate?: string | null;
  technicalInspectionEndDate?: string | null;
  engineOilReplacementKm?: number | null;
  gearboxOilReplacementKm?: number | null;
  color?: string;
  status?: string;
  purchasePrice?: number;
  customsCost?: number;
  deliveryCost?: number;
  repairCost?: number;
  targetSalePrice?: number;
}
