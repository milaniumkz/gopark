import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import type { VehicleDetail, VehicleListItem } from "@gopark/contracts";
import { CarsService } from "./cars.service.js";
import type { CreateCarDto } from "./dto/create-car.dto.js";
import type { UpdateCarDto } from "./dto/update-car.dto.js";
import { Roles } from "../rbac/roles.decorator.js";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";
import { matchesCompanyScope } from "../rbac/company-scope.js";
import {
  assertSeniorManagerOperationalWrite,
  resolveScopedCompanyInput,
} from "../rbac/company-write-scope.js";
import { makeUserRepository } from "../../common/application/repository.factory.js";
import type { UserRepository } from "../../common/repositories/index.js";

@Controller("cars")
export class CarsController {
  private readonly userRepository: UserRepository = makeUserRepository();

  constructor(private readonly carsService: CarsService) {}

  @Get()
  @Roles("owner", "admin", "finance", "manager", "operator", "auditor")
  async listCars(@CurrentUser() currentUser: RequestUser | null): Promise<VehicleListItem[]> {
    if (currentUser?.role === "manager") {
      return currentUser.companyName
        ? await this.carsService.listByCompany(currentUser.companyName)
        : await this.carsService.list();
    }

    if (currentUser?.companyName) {
      return this.carsService.listByCompany(currentUser.companyName);
    }

    return this.carsService.list();
  }

  @Get(":carId")
  @Roles("owner", "admin", "finance", "manager", "operator", "auditor")
  async getCar(
    @Param("carId") carId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<VehicleDetail | null> {
    const row = await this.carsService.getById(carId);
    if (!row || !matchesCompanyScope(currentUser, row.companyName)) {
      return null;
    }

    return row;
  }

  @Post()
  @Roles("owner", "admin", "manager", "operator")
  async createCar(
    @Body() body: CreateCarDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<VehicleListItem> {
    await assertSeniorManagerOperationalWrite(this.userRepository, currentUser);

    return this.carsService.create({
      ...body,
      companyName: resolveScopedCompanyInput(currentUser, body.companyName) ?? undefined,
    }, currentUser);
  }

  @Patch(":carId")
  @Roles("owner", "admin", "manager", "operator")
  async updateCar(
    @Param("carId") carId: string,
    @Body() body: UpdateCarDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<VehicleListItem | null> {
    await assertSeniorManagerOperationalWrite(this.userRepository, currentUser);

    const row = await this.carsService.getById(carId);
    if (!row || !matchesCompanyScope(currentUser, row.companyName)) {
      return null;
    }

    return this.carsService.update(carId, body, currentUser);
  }
}
