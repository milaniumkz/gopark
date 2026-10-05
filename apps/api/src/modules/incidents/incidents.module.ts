import { Module } from "@nestjs/common";
import { IncidentsController } from "./incidents.controller.js";
import { IncidentsService } from "./incidents.service.js";
import { NotificationsModule } from "../notifications/notifications.module.js";

@Module({
  imports: [NotificationsModule],
  controllers: [IncidentsController],
  providers: [IncidentsService],
})
export class IncidentsModule {}
