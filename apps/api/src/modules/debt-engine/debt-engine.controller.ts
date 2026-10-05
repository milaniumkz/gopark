import { Controller, Get, Param } from "@nestjs/common";
import type { DriverDebtSummary } from "@gopark/contracts";
import { Roles } from "../rbac/roles.decorator.js";
import { DebtEngineService } from "./debt-engine.service.js";

@Controller("debt-engine")
export class DebtEngineController {
  constructor(private readonly debtEngineService: DebtEngineService) {}

  @Get("drivers/:driverId/summary")
  @Roles("owner", "admin", "finance", "manager", "auditor")
  async getDriverDebtSummary(@Param("driverId") driverId: string): Promise<DriverDebtSummary> {
    return this.debtEngineService.getDriverDebtSummary(driverId);
  }
}
