import { Body, Controller, ForbiddenException, Get, Patch } from "@nestjs/common";
import type { SettingsOverview } from "@gopark/contracts";
import { Roles } from "../rbac/roles.decorator.js";
import { SettingsService } from "./settings.service.js";
import type { UpdateSettingsDto } from "./dto/update-settings.dto.js";
import { CurrentUser } from "../rbac/current-user.decorator.js";
import type { RequestUser } from "../rbac/request-user.js";

@Controller("settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get("overview")
  @Roles("owner", "admin", "finance", "manager", "operator", "auditor")
  async overview(@CurrentUser() currentUser: RequestUser | null): Promise<SettingsOverview> {
    const overview = await this.settingsService.getOverview();
    if (!currentUser?.companyName) {
      return overview;
    }

    return {
      ...overview,
      companies: overview.companies.filter((item) => item === currentUser.companyName),
    };
  }

  @Patch("overview")
  @Roles("owner", "admin", "finance")
  updateOverview(
    @Body() input: UpdateSettingsDto,
    @CurrentUser() currentUser: RequestUser | null,
  ): Promise<SettingsOverview> {
    if (currentUser?.companyName) {
      throw new ForbiddenException("Company-scoped users cannot change global settings");
    }

    return this.settingsService.updateOverview(input);
  }
}
