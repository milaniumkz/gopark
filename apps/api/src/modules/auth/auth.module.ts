import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { AuthRateLimitService } from "./auth-rate-limit.service.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { AuditModule } from "../audit/audit.module.js";

@Module({
  imports: [NotificationsModule, AuditModule],
  controllers: [AuthController],
  providers: [AuthService, AuthRateLimitService],
})
export class AuthModule {}
