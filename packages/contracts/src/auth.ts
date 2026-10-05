import type { UserRole } from "./platform.js";

export interface LoginRequest {
  login: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface PasswordResetRequest {
  login: string;
}

export interface PasswordResetRequestResponse {
  accepted: true;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface LogoutResponse {
  revoked: true;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  requestUserId: string;
  requestUserRole: UserRole;
  customRoleKey?: string | null;
  managerLevel?: "regular" | "senior" | null;
  companyName?: string | null;
  mustChangePassword?: boolean;
}

export interface UserAdminListItem {
  id: string;
  login: string;
  role: UserRole;
  status: string;
  mfaEnabled: boolean;
  displayName: string;
  managerProfileId?: string | null;
  managerLevel?: "regular" | "senior" | null;
  seniorManagerProfileId?: string | null;
  customRoleKey?: string | null;
  companyName?: string | null;
}

export interface CreateAdminUserRequest {
  phone: string;
  password: string;
  firstName: string;
  lastName: string;
  role: Exclude<UserRole, "driver">;
  customRoleKey?: string | null;
  companyName?: string | null;
  managerLevel?: "regular" | "senior" | null;
  seniorManagerId?: string | null;
}

export interface UpdateAdminUserRequest {
  phone?: string;
  role?: UserRole;
  customRoleKey?: string | null;
  status?: string;
  mfaEnabled?: boolean;
  companyName?: string | null;
  managerLevel?: "regular" | "senior" | null;
  seniorManagerId?: string | null;
  reassignManagerId?: string | null;
}
