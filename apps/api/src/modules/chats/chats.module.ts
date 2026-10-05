import { Module } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { ChatsController } from "./chats.controller.js";
import { ChatsService } from "./chats.service.js";

@Module({
  imports: [NotificationsModule],
  controllers: [ChatsController],
  providers: [ChatsService, PrismaService],
})
export class ChatsModule {}
