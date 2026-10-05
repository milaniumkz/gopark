import { Module } from "@nestjs/common";
import { DebtEngineController } from "./debt-engine.controller.js";
import { DebtEngineService } from "./debt-engine.service.js";

@Module({
  controllers: [DebtEngineController],
  providers: [DebtEngineService],
})
export class DebtEngineModule {}
