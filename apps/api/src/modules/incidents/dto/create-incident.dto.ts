export interface CreateIncidentDto {
  title: string;
  incidentType?: string;
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
  serviceStage?: string | null;
  serviceCaseType?: string | null;
  servicePaymentStatus?: string | null;
  servicePayer?: string | null;
  notifyDriverText?: string | null;
  notifyDriverDate?: string | null;
}
