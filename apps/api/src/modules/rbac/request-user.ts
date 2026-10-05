import type { UserRole } from "@gopark/contracts";

export interface RequestUser {
  id: string;
  role: UserRole;
  customRoleKey?: string | null;
  managerLevel?: "regular" | "senior" | null;
  companyName?: string | null;
}
