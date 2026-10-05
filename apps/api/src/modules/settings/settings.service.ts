import { Injectable } from "@nestjs/common";
import type { SettingsOverview } from "@gopark/contracts";
import { makeSettingsRepository } from "../../common/application/repository.factory.js";
import type { SettingsRepository } from "../../common/repositories/index.js";
import type { UpdateSettingsDto } from "./dto/update-settings.dto.js";

@Injectable()
export class SettingsService {
  private readonly settingsRepository: SettingsRepository = makeSettingsRepository();

  getOverview(): Promise<SettingsOverview> {
    return this.settingsRepository.getOverview();
  }

  updateOverview(input: UpdateSettingsDto): Promise<SettingsOverview> {
    return this.settingsRepository.updateOverview(input);
  }
}
