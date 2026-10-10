import type { ServiceRepairDetails, AccidentDetails } from "@gopark/contracts";
import type { ManagerIncidentItem } from "@gopark/contracts";

export interface CreateIncidentRecord {
  title: string;
  incidentType: string;
  status: string;
  priority: string;
  driverId?: string | null;
  carId?: string | null;
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
  serviceDetails?: ServiceRepairDetails | null;
  accidentDetails?: AccidentDetails | null;
  serviceStage?: string | null;
  serviceCaseType?: string | null;
  servicePaymentStatus?: string | null;
  servicePayer?: string | null;
}

export interface UpdateIncidentRecord {
  title?: string;
  incidentType?: string;
  status?: string;
  priority?: string;
  driverId?: string | null;
  carId?: string | null;
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
  serviceDetails?: ServiceRepairDetails | null;
  accidentDetails?: AccidentDetails | null;
  serviceStage?: string | null;
  serviceCaseType?: string | null;
  servicePaymentStatus?: string | null;
  servicePayer?: string | null;
}

export interface IncidentRepository {
  list(): Promise<ManagerIncidentItem[]>;
  listByCompany(companyName: string): Promise<ManagerIncidentItem[]>;
  countOpen(): Promise<number>;
  countOpenByDrivers(driverIds: string[]): Promise<number>;
  listOpenByDriver(driverId: string): Promise<ManagerIncidentItem[]>;
  create(input: CreateIncidentRecord): Promise<ManagerIncidentItem>;
  completeUntrackedRepair(carId: string, serviceDetails?: ServiceRepairDetails): Promise<ManagerIncidentItem | null>;
  update(incidentId: string, input: UpdateIncidentRecord): Promise<ManagerIncidentItem | null>;
}
