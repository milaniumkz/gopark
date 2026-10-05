import type {
  DriverCreateStatusRequest,
  DriverStatusRequestItem,
} from "@gopark/contracts";

export interface StatusRequestRepository {
  listByDriver(driverId: string): Promise<DriverStatusRequestItem[]>;
  listByDrivers(driverIds: string[]): Promise<DriverStatusRequestItem[]>;
  listRecentByDriver(driverId: string, limit: number): Promise<DriverStatusRequestItem[]>;
  countPendingByDriver(driverId: string): Promise<number>;
  countPendingByDrivers(driverIds: string[]): Promise<number>;
  getById(requestId: string): Promise<DriverStatusRequestItem | null>;
  create(driverId: string, input: DriverCreateStatusRequest): Promise<DriverStatusRequestItem>;
  updateStatus(requestId: string, status: string): Promise<DriverStatusRequestItem | null>;
}
