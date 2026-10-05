import type {
  CreateAdminUserRequest,
  UpdateAdminUserRequest,
  UserRole,
  UserAdminListItem,
} from "@gopark/contracts";

export interface CreateDriverAccountInput {
  firstName: string;
  lastName: string;
  phone: string;
  password: string;
  nearestRelativePhone?: string | null;
  companyName?: string | null;
  managerId?: string | null;
  licenseNumber?: string | null;
  passportNumber?: string | null;
  weeklyDayOff?: string | null;
  mustChangePassword?: boolean;
}

export interface AuthUserRecord extends UserAdminListItem {
  passwordHash?: string | null;
  legacyPassword?: string | null;
  requestUserId: string;
  refreshTokenVersion: number;
  mustChangePassword?: boolean;
}

export interface UserRepository {
  listAdmin(): Promise<UserAdminListItem[]>;
  listAdminByCompany(companyName: string): Promise<UserAdminListItem[]>;
  createAdmin(input: CreateAdminUserRequest): Promise<UserAdminListItem>;
  updateAdmin(userId: string, input: UpdateAdminUserRequest): Promise<UserAdminListItem>;
  createDriverAccount(input: CreateDriverAccountInput): Promise<AuthUserRecord>;
  changePassword(userId: string, password: string): Promise<AuthUserRecord>;
  resetDriverPassword(driverId: string, password: string): Promise<AuthUserRecord | null>;
  findByLogin(login: string): Promise<AuthUserRecord | null>;
  findByRequestPrincipal(requestUserId: string, role: UserRole): Promise<AuthUserRecord | null>;
  getManagerScopeIds(requestUserId: string, companyName?: string | null): Promise<Set<string>>;
  getManagerProfile(requestUserId: string, companyName?: string | null): Promise<UserAdminListItem | null>;
  issueRefreshSession(userId: string): Promise<number>;
  rotateRefreshSession(userId: string): Promise<number>;
  revokeRefreshSession(userId: string): Promise<number>;
}
