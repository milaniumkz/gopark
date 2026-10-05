import { Body, Controller, Post } from "@nestjs/common";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";
import { Roles } from "../rbac/roles.decorator.js";
import { FcmService } from "./fcm.service.js";

@Controller("mobile/push-tokens")
export class PushTokensController {
  constructor(private readonly fcmService: FcmService) {}

  @Post()
  @Roles("owner", "admin", "finance", "manager", "operator", "auditor", "driver")
  registerToken(
    @CurrentUser() currentUser: RequestUser | null,
    @Body() body: { token?: string; platform?: string; app?: string },
  ): Promise<{ ok: true }> {
    if (!currentUser || !body.token?.trim()) {
      return Promise.resolve({ ok: true });
    }

    return this.fcmService.registerToken({
      userId: currentUser.id,
      role: currentUser.role,
      token: body.token.trim(),
      platform: body.platform?.trim() || "android",
      app: body.app?.trim() || "manager",
    });
  }
}
