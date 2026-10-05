import { Module } from "@nestjs/common";
import { CarsController } from "./cars.controller.js";
import { CarsService } from "./cars.service.js";
import { AuditModule } from "../audit/audit.module.js";

@Module({
  imports: [AuditModule],
  controllers: [CarsController],
  providers: [CarsService],
})
export class CarsModule {}
