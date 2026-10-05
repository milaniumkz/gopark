import { Module } from "@nestjs/common";
import { IntegrationEventsService } from "./integration-events.service.js";
import { FcmService } from "../notifications/fcm.service.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";

@Module({
  providers: [IntegrationEventsService, FcmService, PrismaService],
  exports: [IntegrationEventsService],
})
export class IntegrationsModule {}
