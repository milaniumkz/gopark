import type { VehicleDetail, VehicleListItem } from "@gopark/contracts";
import type { CreateCarDto } from "../../modules/cars/dto/create-car.dto.js";
import type { UpdateCarDto } from "../../modules/cars/dto/update-car.dto.js";

export interface CarRepository {
  list(): Promise<VehicleListItem[]>;
  listByCompany(companyName: string): Promise<VehicleListItem[]>;
  getById(carId: string): Promise<VehicleDetail | null>;
  getAssignedByDriver(driverId: string): Promise<VehicleDetail | null>;
  create(input: CreateCarDto): Promise<VehicleListItem>;
  update(carId: string, input: UpdateCarDto): Promise<VehicleListItem | null>;
}
