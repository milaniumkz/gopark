import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import type { ManagerIncidentItem } from "@gopark/contracts";
import {
  makeCarRepository,
  makeDriverRepository,
} from "../../common/application/repository.factory.js";
import type { CarRepository, DriverRepository } from "../../common/repositories/index.js";
import { Roles } from "../rbac/roles.decorator.js";
import { IncidentsService } from "./incidents.service.js";
import type { CreateIncidentDto } from "./dto/create-incident.dto.js";
import type { UpdateIncidentDto } from "./dto/update-incident.dto.js";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";
import {
  assertCarWriteScope,
  assertDriverWriteScope,
  assertSameCompanyPair,
} from "../rbac/company-write-scope.js";

@Controller("incidents")
export class IncidentsController {
  private readonly driverRepository: DriverRepository = makeDriverRepository();
  private readonly carRepository: CarRepository = makeCarRepository();

  constructor(private readonly incidentsService: IncidentsService) {}

  @Get()
  @Roles("owner", "admin", "finance", "manager")
  async list(@CurrentUser() currentUser: RequestUser | null): Promise<ManagerIncidentItem[]> {
    if (currentUser?.companyName) {
      return this.incidentsService.listByCompany(currentUser.companyName);
    }

    return this.incidentsService.list();
  }

  @Post()
  @Roles("owner", "admin", "finance", "manager", "operator")
  async create(
    @Body() body: CreateIncidentDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<ManagerIncidentItem> {
    const [driver, car] = await Promise.all([
      body.driverId ? assertDriverWriteScope(this.driverRepository, body.driverId, currentUser) : Promise.resolve(null),
      body.carId ? assertCarWriteScope(this.carRepository, body.carId, currentUser) : Promise.resolve(null),
    ]);
    assertSameCompanyPair(driver?.companyName, car?.companyName, "Driver and car in incident must belong to the same company");

    return this.incidentsService.create(body);
  }

  @Post("repair-cars/:carId/complete")
  @Roles("owner", "admin", "finance", "manager")
  async completeUntrackedRepair(
    @Param("carId", new ParseUUIDPipe()) carId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<ManagerIncidentItem | null> {
    await assertCarWriteScope(this.carRepository, carId, currentUser);
    return this.incidentsService.completeUntrackedRepair(carId);
  }

  @Patch(":incidentId")
  @Roles("owner", "admin", "finance", "manager", "operator")
  async update(
    @Param("incidentId") incidentId: string,
    @Body() body: UpdateIncidentDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<ManagerIncidentItem | null> {
    const existing = (currentUser?.companyName
      ? await this.incidentsService.listByCompany(currentUser.companyName)
      : await this.incidentsService.list()).find((item) => item.id === incidentId);
    if (!existing) throw new NotFoundException("Incident not found");
    const [driver, car] = await Promise.all([
      body.driverId ? assertDriverWriteScope(this.driverRepository, body.driverId, currentUser) : Promise.resolve(null),
      body.carId ? assertCarWriteScope(this.carRepository, body.carId, currentUser) : Promise.resolve(null),
    ]);
    assertSameCompanyPair(driver?.companyName, car?.companyName, "Driver and car in incident must belong to the same company");

    return this.incidentsService.update(incidentId, body);
  }
}
