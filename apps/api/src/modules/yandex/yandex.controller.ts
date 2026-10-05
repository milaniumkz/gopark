import { Controller, Get, Param } from "@nestjs/common";
import type { YandexDriverBalance } from "@gopark/contracts";
import { Roles } from "../rbac/roles.decorator.js";

@Controller("integrations/yandex")
export class YandexController {
  @Get("drivers/:driverId/balance")
  @Roles("owner", "admin", "finance", "manager", "driver")
  getBalance(@Param("driverId") driverId: string): YandexDriverBalance {
    return {
      driverId,
      amount: 0,
      currency: "KGS",
      syncedAt: new Date().toISOString(),
    };
  }
}
