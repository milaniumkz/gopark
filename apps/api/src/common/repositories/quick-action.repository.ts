import type { ManagerQuickActionItem } from "@gopark/contracts";

export interface QuickActionRepository {
  list(): Promise<ManagerQuickActionItem[]>;
  listByCompany(companyName: string): Promise<ManagerQuickActionItem[]>;
  listByManager(managerId: string): Promise<ManagerQuickActionItem[]>;
  getById(actionId: string): Promise<ManagerQuickActionItem | null>;
}
