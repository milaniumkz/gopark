import type { SettingsOverview, UpdateSettingsRequest } from "@gopark/contracts";

export interface SettingsRepository {
  getOverview(): Promise<SettingsOverview>;
  updateOverview(input: UpdateSettingsRequest): Promise<SettingsOverview>;
}
