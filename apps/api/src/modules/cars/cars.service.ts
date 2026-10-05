import { Injectable } from "@nestjs/common";
import type { VehicleDetail, VehicleListItem } from "@gopark/contracts";
import { makeCarRepository } from "../../common/application/repository.factory.js";
import type { CarRepository } from "../../common/repositories/index.js";
import type { CreateCarDto } from "./dto/create-car.dto.js";
import type { UpdateCarDto } from "./dto/update-car.dto.js";
import { AuditLogService } from "../audit/audit-log.service.js";
import type { RequestUser } from "../rbac/request-user.js";

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

@Injectable()
export class CarsService {
  private readonly repository: CarRepository = makeCarRepository();

  constructor(private readonly auditLogService: AuditLogService) {}

  async list(): Promise<VehicleListItem[]> {
    return this.repository.list();
  }

  async listByCompany(companyName: string): Promise<VehicleListItem[]> {
    return this.repository.listByCompany(companyName);
  }

  async getById(carId: string): Promise<VehicleDetail | null> {
    if (!isUuid(carId)) {
      return null;
    }

    return this.repository.getById(carId);
  }

  async create(input: CreateCarDto, currentUser?: RequestUser | null): Promise<VehicleListItem> {
    const car = await this.repository.create(input);
    await this.auditLogService.write("car.created", "car", car.id, {
      afterData: {
        actor: currentUser ? serializeAuditActor(currentUser) : null,
        car,
      },
    });
    return car;
  }

  async update(carId: string, input: UpdateCarDto, currentUser?: RequestUser | null): Promise<VehicleListItem | null> {
    if (!isUuid(carId)) {
      return null;
    }

    const before = await this.repository.getById(carId);
    const updated = await this.repository.update(carId, input);
    if (updated) {
      await this.auditLogService.write("car.updated", "car", carId, {
        beforeData: { car: before },
        afterData: {
          actor: currentUser ? serializeAuditActor(currentUser) : null,
          changes: input as Record<string, unknown>,
          car: updated,
        },
      });
    }

    return updated;
  }
}

function serializeAuditActor(currentUser: RequestUser): Record<string, unknown> {
  return {
    id: currentUser.id,
    role: currentUser.role,
    companyName: currentUser.companyName ?? null,
    managerLevel: currentUser.managerLevel ?? null,
    customRoleKey: currentUser.customRoleKey ?? null,
  };
}
