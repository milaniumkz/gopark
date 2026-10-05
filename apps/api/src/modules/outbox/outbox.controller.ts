import { Controller, Get, Param, Post } from "@nestjs/common";
import type { OutboxEventItem } from "@gopark/contracts";
import { OutboxService } from "./outbox.service.js";
import { Roles } from "../rbac/roles.decorator.js";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";

@Controller("outbox")
export class OutboxController {
  constructor(private readonly outboxService: OutboxService) {}

  @Get()
  @Roles("owner", "admin", "finance", "auditor")
  async listEvents(@CurrentUser() currentUser: RequestUser | null): Promise<OutboxEventItem[]> {
    if (currentUser?.companyName) {
      return this.outboxService.listByCompany(currentUser.companyName);
    }

    return this.outboxService.list();
  }

  @Post(":eventId/retry")
  @Roles("owner", "admin", "finance")
  async retryEvent(
    @Param("eventId") eventId: string,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<OutboxEventItem> {
    return this.outboxService.retry(eventId, currentUser?.companyName ?? null);
  }
}
