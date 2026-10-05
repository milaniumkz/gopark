import { Module } from "@nestjs/common";
import { MobileManagerController } from "./mobile-manager.controller.js";
import { MobileManagerService } from "./mobile-manager.service.js";
import { MobileReadModule } from "../mobile-read/mobile-read.module.js";
import { ApprovalsModule } from "../approvals/approvals.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";

@Module({
  imports: [MobileReadModule, ApprovalsModule, NotificationsModule],
  controllers: [MobileManagerController],
  providers: [MobileManagerService],
})
export class MobileManagerModule {}
