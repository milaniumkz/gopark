import { Body, Controller, ForbiddenException, Get, Param, Patch, Post } from "@nestjs/common";
import type { ContractDetail, ContractListItem } from "@gopark/contracts";
import { makeCarRepository, makeDriverRepository, makeUserRepository } from "../../common/application/repository.factory.js";
import type { CarRepository, DriverRepository, UserRepository } from "../../common/repositories/index.js";
import { ContractsService } from "./contracts.service.js";
import type { CreateContractDto } from "./dto/create-contract.dto.js";
import type { UpdateContractDto } from "./dto/update-contract.dto.js";
import { Roles } from "../rbac/roles.decorator.js";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";
import { matchesCompanyScope } from "../rbac/company-scope.js";
import {
  assertCarWriteScope,
  assertDriverWriteScope,
  assertSameCompanyPair,
  assertSeniorManagerOperationalWrite,
} from "../rbac/company-write-scope.js";

@Controller("contracts")
export class ContractsController {
  private readonly driverRepository: DriverRepository = makeDriverRepository();
  private readonly carRepository: CarRepository = makeCarRepository();
  private readonly userRepository: UserRepository = makeUserRepository();

  constructor(private readonly contractsService: ContractsService) {}

  @Get()
  @Roles("owner", "admin", "finance", "manager", "auditor")
  async listContracts(@CurrentUser() currentUser: RequestUser | null): Promise<ContractListItem[]> {
    if (currentUser?.role === "manager") {
      const managerIds = await this.userRepository.getManagerScopeIds(currentUser.id, currentUser.companyName ?? null);
      const drivers = currentUser.companyName
        ? await this.driverRepository.listByCompany(currentUser.companyName)
        : await this.driverRepository.list();
      const scopedDriverIds = new Set(
        drivers
          .filter((driver) => driver.managerId && managerIds.has(driver.managerId))
          .map((driver) => driver.id),
      );
      const contracts = currentUser.companyName
        ? await this.contractsService.listByCompany(currentUser.companyName)
        : await this.contractsService.list();
      return contracts.filter((contract) => scopedDriverIds.has(contract.driverId));
    }

    if (currentUser?.companyName) {
      return this.contractsService.listByCompany(currentUser.companyName);
    }

    return this.contractsService.list();
  }

  @Get("next-number")
  @Roles("owner", "admin", "finance", "manager", "auditor", "operator")
  async getNextNumber(): Promise<{ contractNumber: string }> {
    return { contractNumber: await this.contractsService.getNextNumber() };
  }

  @Get(":contractId")
  @Roles("owner", "admin", "finance", "auditor", "manager")
  async getContract(
    @Param("contractId") contractId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<ContractDetail | null> {
    const row = await this.contractsService.getById(contractId);
    if (!row) {
      return null;
    }

    const [driver, car] = await Promise.all([
      this.driverRepository.getById(row.driverId),
      this.carRepository.getById(row.carId),
    ]);

    if (currentUser?.role === "manager") {
      const managerIds = await this.userRepository.getManagerScopeIds(currentUser.id, currentUser.companyName ?? null);
      return driver?.managerId && managerIds.has(driver.managerId) ? row : null;
    }

    return (
      matchesCompanyScope(currentUser, driver?.companyName)
      || matchesCompanyScope(currentUser, car?.companyName)
    ) ? row : null;
  }

  @Post()
  @Roles("owner", "admin", "finance", "manager")
  async createContract(
    @Body() body: CreateContractDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<ContractListItem> {
    await assertSeniorManagerOperationalWrite(this.userRepository, currentUser);

    const [driver, car] = await Promise.all([
      assertDriverWriteScope(this.driverRepository, body.driverId, currentUser),
      assertCarWriteScope(this.carRepository, body.carId, currentUser),
    ]);
    assertSameCompanyPair(driver.companyName, car.companyName);

    if (currentUser?.role === "manager") {
      const managerIds = await this.userRepository.getManagerScopeIds(currentUser.id, currentUser.companyName ?? null);
      if (!driver.managerId || !managerIds.has(driver.managerId)) {
        throw new ForbiddenException("Current manager cannot use this driver");
      }
    }

    return this.contractsService.create(body, currentUser);
  }

  @Patch(":contractId")
  @Roles("owner", "admin", "finance", "manager")
  async updateContract(
    @Param("contractId") contractId: string,
    @Body() body: UpdateContractDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<ContractDetail | null> {
    await assertSeniorManagerOperationalWrite(this.userRepository, currentUser);

    const row = await this.contractsService.getById(contractId);
    if (!row) {
      return null;
    }

    const [driver, car] = await Promise.all([
      this.driverRepository.getById(row.driverId),
      this.carRepository.getById(row.carId),
    ]);

    const inScope =
      matchesCompanyScope(currentUser, driver?.companyName)
      || matchesCompanyScope(currentUser, car?.companyName);

    if (!inScope) {
      return null;
    }

    if (currentUser?.role === "manager") {
      const managerIds = await this.userRepository.getManagerScopeIds(currentUser.id, currentUser.companyName ?? null);
      if (!driver?.managerId || !managerIds.has(driver.managerId)) {
        return null;
      }
    }

    return this.contractsService.update(contractId, body, currentUser);
  }
}
