import { Module } from "@nestjs/common";
import { OutboxModule } from "../outbox/outbox.module.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";
import { NotificationsCreateService } from "./notifications-create.service.js";
import { FcmService } from "./fcm.service.js";
import { PushTokensController } from "./push-tokens.controller.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";

@Module({
  imports: [OutboxModule],
  controllers: [NotificationsController, PushTokensController],
  providers: [NotificationsService, NotificationsCreateService, FcmService, PrismaService],
  exports: [NotificationsCreateService, FcmService],
})
export class NotificationsModule {}
