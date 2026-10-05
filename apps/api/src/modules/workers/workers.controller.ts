import { Controller, ForbiddenException, Post } from "@nestjs/common";
import type { OutboxProcessResult } from "@gopark/contracts";
import { OutboxWorkerService } from "./outbox-worker.service.js";
import { Roles } from "../rbac/roles.decorator.js";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";

@Controller("workers")
export class WorkersController {
  constructor(private readonly outboxWorkerService: OutboxWorkerService) {}

  @Post("outbox/process")
  @Roles("owner", "admin", "finance")
  async processOutbox(@CurrentUser() currentUser: RequestUser | null): Promise<OutboxProcessResult> {
    if (currentUser?.companyName) {
      throw new ForbiddenException("Company-scoped users cannot process the global outbox");
    }

    return this.outboxWorkerService.processPendingEvents();
  }
}
