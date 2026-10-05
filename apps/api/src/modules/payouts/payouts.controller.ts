import { Body, Controller, Get, Post } from "@nestjs/common";
import type { PayoutListItem } from "@gopark/contracts";
import { makeDriverRepository } from "../../common/application/repository.factory.js";
import type { DriverRepository } from "../../common/repositories/index.js";
import { PayoutsService } from "./payouts.service.js";
import type { CreatePayoutDto } from "./dto/create-payout.dto.js";
import { Roles } from "../rbac/roles.decorator.js";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";
import { matchesCompanyScope } from "../rbac/company-scope.js";
import { assertDriverWriteScope } from "../rbac/company-write-scope.js";

@Controller("payouts")
export class PayoutsController {
  private readonly driverRepository: DriverRepository = makeDriverRepository();

  constructor(private readonly payoutsService: PayoutsService) {}

  @Get()
  @Roles("owner", "admin", "finance", "auditor")
  async listPayouts(@CurrentUser() currentUser: RequestUser | null): Promise<PayoutListItem[]> {
    if (currentUser?.companyName) {
      return this.payoutsService.listByCompany(currentUser.companyName);
    }

    return this.payoutsService.list();
  }

  @Post()
  @Roles("owner", "admin", "finance", "driver")
  async createPayout(
    @Body() body: CreatePayoutDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<PayoutListItem> {
    await assertDriverWriteScope(this.driverRepository, body.driverId, currentUser);
    return this.payoutsService.create(body, currentUser);
  }
}
