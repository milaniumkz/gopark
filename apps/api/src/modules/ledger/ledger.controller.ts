import { Body, Controller, Get, Post } from "@nestjs/common";
import type { LedgerEntry } from "@gopark/contracts";
import {
  makeCarRepository,
  makeContractRepository,
  makeDriverRepository,
} from "../../common/application/repository.factory.js";
import type { CarRepository, ContractRepository, DriverRepository } from "../../common/repositories/index.js";
import { LedgerService } from "./ledger.service.js";
import type { CreateLedgerEntryDto } from "./dto/create-ledger-entry.dto.js";
import { Roles } from "../rbac/roles.decorator.js";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";
import {
  assertContractWriteScope,
  assertDriverWriteScope,
} from "../rbac/company-write-scope.js";

@Controller("ledger")
export class LedgerController {
  private readonly driverRepository: DriverRepository = makeDriverRepository();
  private readonly contractRepository: ContractRepository = makeContractRepository();
  private readonly carRepository: CarRepository = makeCarRepository();

  constructor(private readonly ledgerService: LedgerService) {}

  @Get("entries")
  @Roles("owner", "admin", "finance", "auditor")
  async listEntries(@CurrentUser() currentUser: RequestUser | null): Promise<LedgerEntry[]> {
    if (currentUser?.companyName) {
      return this.ledgerService.listByCompany(currentUser.companyName);
    }

    return this.ledgerService.list();
  }

  @Post("entries")
  @Roles("owner", "admin", "finance")
  async createEntry(
    @Body() body: CreateLedgerEntryDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<LedgerEntry> {
    if (body.driverId) {
      await assertDriverWriteScope(this.driverRepository, body.driverId, currentUser);
    }
    if (body.contractId) {
      await assertContractWriteScope(
        this.contractRepository,
        this.driverRepository,
        this.carRepository,
        body.contractId,
        currentUser,
      );
    }

    return this.ledgerService.create(body);
  }
}
