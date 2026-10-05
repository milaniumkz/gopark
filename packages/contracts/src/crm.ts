export interface DashboardSummary {
  activeDrivers: number;
  activeCars: number;
  debtTotal: number;
  pendingPayouts: number;
}

export interface DashboardOverview {
  plannedPayment: number;
  actualPayment: number;
  debt: number;
  overpayment: number;
  drivers: {
    total: number;
    active: number;
    paid: number;
    unpaid: number;
    dayoff: number;
    vacation: number;
  };
  vehicles: {
    installment: number;
    office: number;
    customs: number;
    accident: number;
    idle: number;
    writtenOff: number;
    sold: number;
  };
}

export interface DriverListItem {
  id: string;
  fullName: string;
  phone: string;
  nearestRelativePhone?: string | null;
  licenseNumber?: string | null;
  passportNumber?: string | null;
  companyName?: string | null;
  weeklyDayOff?: string | null;
  status: string;
  riskStatus: string;
  managerId: string | null;
  activeContractId: string | null;
  creditBalance: number;
  photoUrl?: string | null;
  photoStatus?: "missing" | "pending" | "approved" | "rejected" | string;
  photoUploadedAt?: string | null;
  photoReviewedAt?: string | null;
  photoReviewNote?: string | null;
}

export interface DriverDetail extends DriverListItem {
  assignedCarId: string | null;
  currentDebt: number;
  totalObligations: number;
  totalPaid: number;
}

export interface DriverDayEventItem {
  id: string;
  type: "payment" | "obligation" | "incident" | "risk_status" | "contract" | "car_assignment";
  title: string;
  details: string;
  createdAt: string;
}

export interface DriverRiskStatusChangeItem {
  id: string;
  driverId: string;
  driverName: string;
  previousStatus: string | null;
  nextStatus: string;
  changedByUserId: string | null;
  changedAt: string;
  note: string | null;
}

export interface VehicleListItem {
  id: string;
  plateNumber: string;
  vin: string;
  make?: string;
  model?: string;
  productionYear?: number | null;
  mileage?: number | null;
  osagoStartDate?: string | null;
  osagoEndDate?: string | null;
  cascoStartDate?: string | null;
  cascoEndDate?: string | null;
  technicalInspectionStartDate?: string | null;
  technicalInspectionEndDate?: string | null;
  engineOilReplacementKm?: number | null;
  gearboxOilReplacementKm?: number | null;
  color?: string | null;
  companyName?: string | null;
  status: string;
  assignedDriverId: string | null;
  lastAssignedDriverId?: string | null;
  managerId?: string | null;
  managerName?: string | null;
  purchasePrice?: number | null;
  customsCost?: number | null;
  deliveryCost?: number | null;
  repairCost?: number | null;
  targetSalePrice?: number | null;
  totalAcquisitionCost?: number | null;
  activeContractId?: string | null;
  currentDebt?: number | null;
  nextDueAmount?: number | null;
  nextDueDate?: string | null;
  hasDeferredPayment?: boolean | null;
  statusSinceDate?: string | null;
}

export interface VehicleDetail extends VehicleListItem {
  activeContractId: string | null;
  financedAmount: number | null;
  installmentAmount: number | null;
  assignmentHistory?: Array<{
    id: string;
    driverId: string;
    driverName: string;
    startedAt: string;
    endedAt: string | null;
  }>;
}

export interface ReportsOverview {
  collectionRatePercent: number;
  overdueDebtTotal: number;
  requestedPayoutsCount: number;
  openIncidentsCount: number;
  pendingOutboxCount: number;
}
