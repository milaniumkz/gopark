import type { IncidentStatusHistoryEntry, ManagerIncidentItem } from "@gopark/contracts";
import type { UpdateIncidentRecord } from "./incident.repository.js";

export function nextIncidentStatusHistory(
  incident: Pick<ManagerIncidentItem, "status" | "serviceStage" | "statusHistory">,
  patch: UpdateIncidentRecord,
): IncidentStatusHistoryEntry[] {
  const status = patch.status ?? incident.status;
  const serviceStage = patch.serviceStage === undefined
    ? incident.serviceStage ?? null
    : patch.serviceStage;
  const history = incident.statusHistory ?? [];
  if (status === incident.status && serviceStage === (incident.serviceStage ?? null)) {
    return history;
  }
  return [...history, { status, serviceStage, changedAt: new Date().toISOString() }];
}
