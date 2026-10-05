import { Body, Controller, Get, Post } from "@nestjs/common";
import { Roles } from "../rbac/roles.decorator.js";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";
import { PartsService, type PartItem, type PartsOverview } from "./parts.service.js";
import type { CreatePartDto } from "./dto/create-part.dto.js";
import type { ReceivePartDto } from "./dto/receive-part.dto.js";
import type { WriteoffPartDto } from "./dto/writeoff-part.dto.js";

@Controller("parts")
export class PartsController {
  constructor(private readonly partsService: PartsService) {}

  @Get()
  @Roles("owner", "admin", "finance", "manager", "operator", "auditor")
  async overview(@CurrentUser() currentUser: RequestUser | null): Promise<PartsOverview> {
    return this.partsService.overview(currentUser?.companyName ?? null);
  }

  @Post()
  @Roles("owner", "admin", "finance", "manager", "operator")
  async create(
    @Body() body: CreatePartDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<PartItem> {
    return this.partsService.create(body, currentUser?.companyName ?? null);
  }

  @Post("receive")
  @Roles("owner", "admin", "finance", "manager", "operator")
  async receive(
    @Body() body: ReceivePartDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<PartsOverview> {
    return this.partsService.receive(body, currentUser?.companyName ?? null);
  }

  @Post("writeoff")
  @Roles("owner", "admin", "finance", "manager", "operator")
  async writeoff(
    @Body() body: WriteoffPartDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<PartsOverview> {
    return this.partsService.writeoff(body, currentUser?.companyName ?? null);
  }
}
