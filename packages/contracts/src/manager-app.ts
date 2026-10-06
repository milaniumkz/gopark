export interface ManagerDashboardSummary {
  assignedDrivers: number;
  overdueDrivers: number;
  paymentDueDrivers: number;
  activeCars: number;
  incidentsOpen: number;
  dueTodayAmount: number;
  pendingStatusRequests: number;
  criticalAlerts: number;
}

export interface ManagerAssignedDriverItem {
  id: string;
  fullName: string;
  phone: string;
  status: string;
  riskStatus: string;
  weeklyDayOff: string | null;
  vehicle: string;
  vehicleStatus?: string | null;
  debt: number;
  creditBalance: number;
  overdueDebt: number;
  overdueSinceDate: string | null;
  overdueUntilDate: string | null;
  duePeriodAmount?: number;
  yandexBalance: number;
  nextPaymentAmount: number;
  nextPaymentDate: string | null;
  lastPaymentDate: string | null;
  managerId: string | null;
  managerName?: string | null;
  contractId: string | null;
  photoUrl?: string | null;
  photoStatus?: "missing" | "pending" | "approved" | "rejected" | string;
}

export type ManagerIdleVehicleCategory = "office" | "accident" | "insurance_gps" | "service" | "impound" | "written_off";

export interface ManagerIdleVehicleItem {
  id: string;
  plateNumber: string;
  label: string;
  status: string;
  category: ManagerIdleVehicleCategory;
  categoryLabel: string;
  reason: string;
  driverId?: string | null;
  driverName?: string | null;
  managerId?: string | null;
  managerName?: string | null;
  incidentId?: string | null;
  sinceDate?: string | null;
}

export interface ManagerTeamItem {
  id: string;
  managerProfileId: string;
  displayName: string;
  phone: string;
  managerLevel: "regular" | "senior" | null;
  driversTotal: number;
  problemDrivers: number;
  carsTotal: number;
  idleCarsTotal?: number;
  idleOfficeCars?: number;
  idleAccidentCars?: number;
  idleInsuranceGpsCars?: number;
  idleServiceCars?: number;
  idleImpoundCars?: number;
  debtTotal: number;
}

export interface ManagerDriverDetail {
  id: string;
  fullName: string;
  phone: string;
  status: string;
  riskStatus: string;
  weeklyDayOff: string | null;
  vehicle: string | null;
  contractNumber: string | null;
  managerId: string | null;
  debt: number;
  creditBalance: number;
  overdueDebt: number;
  overdueSinceDate: string | null;
  overdueUntilDate: string | null;
  yandexBalance: number;
  nextPaymentAmount: number;
  nextPaymentDate: string | null;
  lastPaymentDate: string | null;
  pendingStatusRequestsCount: number;
  recentStatusRequests: Array<{
    id: string;
    type: string;
    status: string;
    period: string;
    note?: string | null;
  }>;
  openIncidents: Array<{
    id: string;
    title: string;
    incidentType?: string | null;
    priority: string;
    status: string;
    occurredAt?: string | null;
    statusHistory?: IncidentStatusHistoryEntry[];
    serviceStage?: string | null;
    serviceCaseType?: string | null;
    repairNote?: string | null;
    accidentPhotoUrl?: string | null;
  }>;
  photoUrl?: string | null;
  photoStatus?: "missing" | "pending" | "approved" | "rejected" | string;
  photoUploadedAt?: string | null;
  photoReviewedAt?: string | null;
  photoReviewNote?: string | null;
}

export interface ManagerStatusRequestItem {
  id: string;
  driverId: string;
  driverName: string;
  managerName?: string | null;
  type: string;
  status: string;
  period: string;
  note?: string | null;
  createdAt: string;
}

export interface ManagerRiskStatusReviewItem {
  id: string;
  driverId: string;
  driverName: string;
  requestedByManagerId: string;
  requestedByManagerName: string;
  previousStatus: string;
  requestedStatus: string;
  reviewStatus: string;
  note: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface ManagerDriverPaymentItem {
  id: string;
  contractId: string;
  amount: number;
  appliedAmount: number;
  unappliedAmount: number;
  status: string;
  provider: string;
  paymentForDate?: string | null;
  createdAt: string;
}

export interface ManagerAlertItem {
  id: string;
  title: string;
  details: string;
  managerId?: string | null;
  managerName?: string | null;
}

export interface ManagerQuickActionItem {
  id: string;
  label: string;
  target: string;
  managerId?: string | null;
}

export interface ManagerExecuteActionRequest {
  actionId: string;
}

export interface ManagerExecuteActionResult {
  success: boolean;
  actionId: string;
  executedAt: string;
}

export interface IncidentStatusHistoryEntry {
  status: string;
  serviceStage: string | null;
  changedAt: string;
}

export interface ManagerIncidentItem {
  id: string;
  title: string;
  incidentType?: string;
  status: string;
  priority: string;
  driverId?: string;
  driverName?: string | null;
  carId?: string;
  occurredAt?: string | null;
  periodLabel?: string | null;
  referenceNumber?: string | null;
  amount?: number | null;
  insuranceCompensationAmount?: number | null;
  writeoffAmount?: number | null;
  description?: string | null;
  accidentPhotoUrl?: string | null;
  insuranceNote?: string | null;
  repairNote?: string | null;
  locationNote?: string | null;
  managerLabel?: string | null;
  statusHistory?: IncidentStatusHistoryEntry[];
  serviceStage?: string | null;
  serviceCaseType?: string | null;
  servicePaymentStatus?: string | null;
  servicePayer?: string | null;
}
