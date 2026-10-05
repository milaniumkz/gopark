import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { DriverDayEventItem, DriverDetail, DriverListItem, DriverRiskStatusChangeItem } from "@gopark/contracts";
import { makeUserRepository } from "../../common/application/repository.factory.js";
import type { UserRepository } from "../../common/repositories/index.js";
import { DriversService } from "./drivers.service.js";
import type { CreateDriverDto } from "./dto/create-driver.dto.js";
import type { UpdateDriverDto } from "./dto/update-driver.dto.js";
import type { UpdateDriverManagerDto } from "./dto/update-driver-manager.dto.js";
import { Roles } from "../rbac/roles.decorator.js";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";
import { matchesCompanyScope } from "../rbac/company-scope.js";
import {
  assertManagerAssignmentScope,
  assertSeniorManagerOperationalWrite,
  resolveScopedCompanyInput,
} from "../rbac/company-write-scope.js";

@Controller("drivers")
export class DriversController {
  private readonly userRepository: UserRepository = makeUserRepository();

  constructor(private readonly driversService: DriversService) {}

  @Get()
  @Roles("owner", "admin", "finance", "manager", "operator", "auditor")
  async listDrivers(@CurrentUser() currentUser: RequestUser | null): Promise<DriverListItem[]> {
    if (currentUser?.role === "manager") {
      const managerIds = await this.userRepository.getManagerScopeIds(currentUser.id, currentUser.companyName ?? null);
      const drivers = currentUser.companyName
        ? await this.driversService.listByCompany(currentUser.companyName)
        : await this.driversService.list();
      return drivers.filter((driver) => driver.managerId && managerIds.has(driver.managerId));
    }

    if (currentUser?.companyName) {
      return this.driversService.listByCompany(currentUser.companyName);
    }

    return this.driversService.list();
  }

  @Get("risk-status-changes")
  @Roles("owner", "admin", "finance", "manager", "operator", "auditor")
  async listRiskStatusChanges(@CurrentUser() currentUser: RequestUser | null): Promise<DriverRiskStatusChangeItem[]> {
    const changes = await this.driversService.listRiskStatusChanges();
    if (!currentUser?.companyName) {
      return changes;
    }

    const drivers = await this.driversService.listByCompany(currentUser.companyName);
    const scopedDriverIds = new Set(drivers.map((item) => item.id));
    return changes.filter((item) => scopedDriverIds.has(item.driverId));
  }

  @Get(":driverId/day-events")
  @Roles("owner", "admin", "finance", "manager", "operator", "auditor")
  async getDriverDayEvents(
    @Param("driverId") driverId: string,
    @Query("date") date: string | undefined,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<DriverDayEventItem[]> {
    const driver = await this.driversService.getById(driverId);
    if (!driver || !matchesCompanyScope(currentUser, driver.companyName)) {
      return [];
    }
    return this.driversService.getDayEvents(driverId, date ?? new Date().toISOString().slice(0, 10));
  }

  @Get(":driverId")
  @Roles("owner", "admin", "finance", "manager", "operator", "auditor")
  async getDriver(
    @Param("driverId") driverId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<DriverDetail | null> {
    const row = await this.driversService.getById(driverId);
    if (!row || !matchesCompanyScope(currentUser, row.companyName)) {
      return null;
    }

    if (currentUser?.role === "manager") {
      const managerIds = await this.userRepository.getManagerScopeIds(currentUser.id, currentUser.companyName ?? null);
      return row.managerId && managerIds.has(row.managerId) ? row : null;
    }

    return row;
  }

  @Patch(":driverId/photo-review")
  @Roles("owner", "admin", "manager", "operator")
  async reviewDriverPhoto(
    @Param("driverId") driverId: string,
    @Body() body: { action?: string; note?: string },
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<DriverDetail | null> {
    await assertSeniorManagerOperationalWrite(this.userRepository, currentUser);
    const driver = await this.driversService.getById(driverId);
    if (!driver || !matchesCompanyScope(currentUser, driver.companyName)) {
      return null;
    }
    return this.driversService.reviewPhoto(driverId, body.action, body.note, currentUser?.id ?? null);
  }

  @Post()
  @Roles("owner", "admin", "manager", "operator")
  async createDriver(
    @Body() body: CreateDriverDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<DriverListItem> {
    await assertSeniorManagerOperationalWrite(this.userRepository, currentUser);

    const companyName = resolveScopedCompanyInput(currentUser, body.companyName);
    await assertManagerAssignmentScope(
      this.userRepository,
      body.managerId?.trim() || null,
      companyName,
      currentUser,
    );

    return this.driversService.create({
      ...body,
      companyName: companyName ?? undefined,
    }, currentUser);
  }

  @Patch(":driverId")
  @Roles("owner", "admin", "manager", "operator")
  async updateDriver(
    @Param("driverId") driverId: string,
    @Body() body: UpdateDriverDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<DriverListItem | null> {
    await assertSeniorManagerOperationalWrite(this.userRepository, currentUser);

    const driver = await this.driversService.getById(driverId);
    if (!driver || !matchesCompanyScope(currentUser, driver.companyName)) {
      return null;
    }

    return this.driversService.update(driverId, body, currentUser);
  }

  @Patch(":driverId/manager")
  @Roles("owner", "admin", "manager", "operator")
  async updateDriverManager(
    @Param("driverId") driverId: string,
    @Body() body: UpdateDriverManagerDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<DriverListItem | null> {
    await assertSeniorManagerOperationalWrite(this.userRepository, currentUser);

    const driver = await this.driversService.getById(driverId);
    if (!driver || !matchesCompanyScope(currentUser, driver.companyName)) {
      return null;
    }

    await assertManagerAssignmentScope(
      this.userRepository,
      body.managerId?.trim() || null,
      driver.companyName,
      currentUser,
    );

    return this.driversService.updateManager(driverId, body, currentUser);
  }

  @Patch(":driverId/reset-password")
  @Roles("owner", "admin", "manager", "operator")
  async resetDriverPassword(
    @Param("driverId") driverId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<{ temporaryPassword: string } | null> {
    await assertSeniorManagerOperationalWrite(this.userRepository, currentUser);

    const driver = await this.driversService.getById(driverId);
    if (!driver || !matchesCompanyScope(currentUser, driver.companyName)) {
      return null;
    }

    if (currentUser?.role === "manager") {
      const managerIds = await this.userRepository.getManagerScopeIds(currentUser.id, currentUser.companyName ?? null);
      if (!driver.managerId || !managerIds.has(driver.managerId)) {
        return null;
      }
    }

    return this.driversService.resetPassword(driverId, currentUser);
  }
}
