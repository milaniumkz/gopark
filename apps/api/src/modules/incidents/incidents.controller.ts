import { Body, BadRequestException, ForbiddenException, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from "@nestjs/common";
import type { ManagerIncidentItem, ServiceRepairDetails } from "@gopark/contracts";
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
  @Roles("owner", "admin", "finance", "manager", "operator", "auditor")
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

    if(body.incidentType === "repair" && !car) throw new BadRequestException("Выберите автомобиль для ремонта");
    if(body.incidentType === "repair" && body.status === "open" && body.serviceStage !== "sent_to_service" && !(body.serviceStage === "in_repair" && car?.status === "maintenance")) {
      body = {...body,serviceStage:"sent_to_service",serviceDetails:body.serviceDetails ?? {reason:body.repairNote ?? body.description ?? ""}};
    }
    if(body.serviceStage === "completed" && (!body.serviceDetails?.orderNumber?.trim() || !body.serviceDetails.works?.some(w=>w.trim()))) throw new BadRequestException("Для завершения нужны номер заказ-наряда и работы");
    if(currentUser?.role === "manager" && body.incidentType === "repair" && body.serviceStage !== "sent_to_service") throw new ForbiddenException("Бригадир отправляет машину на СТО; дальнейшие этапы подтверждает СТО");
    return this.incidentsService.create(body);
  }

  @Post("repair-cars/:carId/complete")
  @Roles("owner", "admin", "finance", "manager", "operator")
  async completeUntrackedRepair(
    @Param("carId", new ParseUUIDPipe()) carId: string,
    @CurrentUser() currentUser: RequestUser | null,
    @Body() body?: { serviceDetails?: ServiceRepairDetails },
  ): Promise<ManagerIncidentItem | null> {
    await assertCarWriteScope(this.carRepository, carId, currentUser);
    if(currentUser?.role === "manager") throw new ForbiddenException("Завершение ремонта подтверждает сотрудник СТО");
    return this.incidentsService.completeUntrackedRepair(carId, body?.serviceDetails);
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

    if(currentUser?.role === "manager" && (existing.incidentType === "repair" || existing.serviceDetails || existing.incidentType === "accident" && body.serviceStage !== "sent_to_service") && (body.serviceDetails || body.serviceStage && body.serviceStage !== existing.serviceStage || body.status && body.status !== existing.status)) throw new ForbiddenException("Этапы ремонта и заказ-наряд заполняет сотрудник СТО");
    return this.incidentsService.update(incidentId, body);
  }
}
