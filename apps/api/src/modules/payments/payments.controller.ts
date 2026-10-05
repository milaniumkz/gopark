import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import type {
  ClearPaymentCalendarDayOverrideDto,
  ContractEarlyPayoffResult,
  DriverCreditWriteoffResult,
  PaymentCalendarDayOverrideItem,
  PaymentListItem,
  UpsertPaymentCalendarDayOverrideDto,
} from "@gopark/contracts";
import {
  makeCarRepository,
  makeContractRepository,
  makeDriverRepository,
} from "../../common/application/repository.factory.js";
import type { CarRepository, ContractRepository, DriverRepository } from "../../common/repositories/index.js";
import { PaymentsService } from "./payments.service.js";
import type { CreatePaymentDto } from "./dto/create-payment.dto.js";
import type { CreateContractEarlyPayoffDto } from "./dto/create-contract-early-payoff.dto.js";
import type { CreateDriverCreditWriteoffDto } from "./dto/create-driver-credit-writeoff.dto.js";
import { Roles } from "../rbac/roles.decorator.js";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";
import { matchesCompanyScope } from "../rbac/company-scope.js";
import {
  assertContractWriteScope,
  assertDriverWriteScope,
} from "../rbac/company-write-scope.js";

@Controller("payments")
export class PaymentsController {
  private readonly driverRepository: DriverRepository = makeDriverRepository();
  private readonly contractRepository: ContractRepository = makeContractRepository();
  private readonly carRepository: CarRepository = makeCarRepository();

  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  @Roles("owner", "admin", "finance", "auditor")
  async listPayments(@CurrentUser() currentUser: RequestUser | null): Promise<PaymentListItem[]> {
    if (currentUser?.companyName) {
      return this.paymentsService.listByCompany(currentUser.companyName);
    }

    return this.paymentsService.list();
  }

  @Get("calendar-overrides")
  @Roles("owner", "admin", "finance", "operator", "auditor")
  async listCalendarOverrides(
    @Query("month") month: string | undefined,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<PaymentCalendarDayOverrideItem[]> {
    return this.paymentsService.listCalendarOverrides(month, currentUser?.companyName ?? null);
  }

  @Post("calendar-overrides")
  @Roles("owner", "admin", "finance", "operator")
  async upsertCalendarOverride(
    @Body() body: UpsertPaymentCalendarDayOverrideDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<PaymentCalendarDayOverrideItem> {
    await assertDriverWriteScope(this.driverRepository, body.driverId, currentUser);
    return this.paymentsService.upsertCalendarOverride(body, currentUser);
  }

  @Post("calendar-overrides/clear")
  @Roles("owner", "admin", "finance", "operator")
  async clearCalendarOverride(
    @Body() body: ClearPaymentCalendarDayOverrideDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<{ ok: true }> {
    await assertDriverWriteScope(this.driverRepository, body.driverId, currentUser);
    await this.paymentsService.clearCalendarOverride(body);
    return { ok: true };
  }

  @Post()
  @Roles("owner", "admin", "finance", "operator")
  async createPayment(
    @Body() body: CreatePaymentDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<PaymentListItem> {
    await assertDriverWriteScope(this.driverRepository, body.driverId, currentUser);
    await assertContractWriteScope(
      this.contractRepository,
      this.driverRepository,
      this.carRepository,
      body.contractId,
      currentUser,
    );
    return this.paymentsService.create(body, currentUser);
  }

  @Post("early-payoff")
  @Roles("owner", "admin", "finance")
  async payOffContractEarly(
    @Body() body: CreateContractEarlyPayoffDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<ContractEarlyPayoffResult> {
    await assertDriverWriteScope(this.driverRepository, body.driverId, currentUser);
    await assertContractWriteScope(
      this.contractRepository,
      this.driverRepository,
      this.carRepository,
      body.contractId,
      currentUser,
    );
    return this.paymentsService.payOffContractEarly(body, currentUser);
  }

  @Post("credit-writeoff")
  @Roles("owner", "admin", "finance")
  async writeOffCredit(
    @Body() body: CreateDriverCreditWriteoffDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<DriverCreditWriteoffResult> {
    await assertDriverWriteScope(this.driverRepository, body.driverId, currentUser);
    return this.paymentsService.writeOffCredit(body, currentUser);
  }
}
