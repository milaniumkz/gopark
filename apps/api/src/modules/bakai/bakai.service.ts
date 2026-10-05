import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { BakaiWebhookAck } from "@gopark/contracts";
import { makeSettingsRepository } from "../../common/application/repository.factory.js";
import type { SettingsRepository } from "../../common/repositories/index.js";

@Injectable()
export class BakaiService {
  private readonly settingsRepository: SettingsRepository = makeSettingsRepository();

  async handleWebhook(payload: unknown): Promise<BakaiWebhookAck> {
    const settings = await this.settingsRepository.getOverview();

    if (!settings.bakaiWebhookEnabled) {
      throw new ServiceUnavailableException("Bakai webhooks are disabled");
    }

    return {
      accepted: true,
      payload,
    };
  }
}
