import { Module } from "@nestjs/common";
import { MobileDriverController } from "./mobile-driver.controller.js";
import { MobileDriverService } from "./mobile-driver.service.js";
import { FinanceWorkflowModule } from "../finance-workflow/finance-workflow.module.js";
import { MobileReadModule } from "../mobile-read/mobile-read.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";

@Module({
  imports: [MobileReadModule, FinanceWorkflowModule, NotificationsModule],
  controllers: [MobileDriverController],
  providers: [MobileDriverService],
})
export class MobileDriverModule {}
