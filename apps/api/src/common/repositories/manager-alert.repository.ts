import type { ManagerAlertItem } from "@gopark/contracts";

export interface ManagerAlertRepository {
  list(): Promise<ManagerAlertItem[]>;
  listByCompany(companyName: string): Promise<ManagerAlertItem[]>;
  listByManager(managerId: string): Promise<ManagerAlertItem[]>;
  create(input: Omit<ManagerAlertItem, "id">): Promise<ManagerAlertItem>;
}
