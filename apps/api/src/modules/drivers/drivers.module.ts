import { Module } from "@nestjs/common";
import { DriversController } from "./drivers.controller.js";
import { DriversService } from "./drivers.service.js";
import { AuditModule } from "../audit/audit.module.js";

@Module({
  imports: [AuditModule],
  controllers: [DriversController],
  providers: [DriversService],
})
export class DriversModule {}
