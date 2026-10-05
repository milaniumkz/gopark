import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import type {
  ChangePasswordRequest,
  LoginRequest,
  LogoutRequest,
  LogoutResponse,
  PasswordResetRequest,
  PasswordResetRequestResponse,
  RefreshRequest,
  TokenPair,
} from "@gopark/contracts";
import { makeUserRepository } from "../../common/application/repository.factory.js";
import type { UserRepository } from "../../common/repositories/index.js";
import { issueTokenPair, verifyRefreshToken } from "./auth-token.util.js";
import { verifyPassword } from "./password.util.js";
import type { RequestUser } from "../rbac/request-user.js";
import { NotificationsCreateService } from "../notifications/notifications-create.service.js";
import { AuditLogService } from "../audit/audit-log.service.js";

@Injectable()
export class AuthService {
  private readonly userRepository: UserRepository = makeUserRepository();

  constructor(
    private readonly notificationsCreateService?: NotificationsCreateService,
    private readonly auditLogService?: AuditLogService,
  ) {}

  async login(payload: LoginRequest): Promise<TokenPair> {
    const user = await this.userRepository.findByLogin(payload.login);

    if (
      !user
      || user.status !== "active"
      || !verifyPassword(payload.password, user.passwordHash, user.legacyPassword)
    ) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const refreshSessionVersion = await this.userRepository.issueRefreshSession(user.id);

    return issueTokenPair(
      user.requestUserId,
      user.role,
      refreshSessionVersion,
      user.companyName,
      user.mustChangePassword ?? false,
      user.managerLevel ?? null,
      user.customRoleKey ?? null,
    );
  }

  async refresh(payload: RefreshRequest): Promise<TokenPair> {
    const token = verifyRefreshToken(payload.refreshToken);
    if (!token) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const user = await this.userRepository.findByRequestPrincipal(token.sub, token.role);
    if (
      !user
      || user.status !== "active"
      || token.sessionVersion !== user.refreshTokenVersion
    ) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const refreshSessionVersion = await this.userRepository.rotateRefreshSession(user.id);

    return issueTokenPair(
      user.requestUserId,
      user.role,
      refreshSessionVersion,
      user.companyName,
      user.mustChangePassword ?? false,
      user.managerLevel ?? null,
      user.customRoleKey ?? null,
    );
  }

  async changePassword(currentUser: RequestUser | null, payload: ChangePasswordRequest): Promise<TokenPair> {
    if (!currentUser) {
      throw new UnauthorizedException("Missing bearer session");
    }

    const currentPassword = payload.currentPassword.trim();
    const newPassword = payload.newPassword.trim();
    if (!currentPassword || newPassword.length < 6) {
      throw new BadRequestException("Password must be at least 6 characters");
    }

    const user = await this.userRepository.findByRequestPrincipal(currentUser.id, currentUser.role);
    if (
      !user
      || user.status !== "active"
      || !verifyPassword(currentPassword, user.passwordHash, user.legacyPassword)
    ) {
      throw new UnauthorizedException("Invalid current password");
    }

    const updated = await this.userRepository.changePassword(user.id, newPassword);
    await this.auditLogService?.write("user.password.changed", currentUser.role, currentUser.id, {
      afterData: {
        actor: {
          id: currentUser.id,
          role: currentUser.role,
          companyName: currentUser.companyName ?? null,
        },
        requestUserId: updated.requestUserId,
        role: updated.role,
        mustChangePassword: updated.mustChangePassword ?? false,
      },
    });

    return issueTokenPair(
      updated.requestUserId,
      updated.role,
      updated.refreshTokenVersion,
      updated.companyName,
      updated.mustChangePassword ?? false,
      updated.managerLevel ?? null,
      updated.customRoleKey ?? null,
    );
  }

  async requestPasswordReset(payload: PasswordResetRequest): Promise<PasswordResetRequestResponse> {
    const login = this.normalizePhoneLogin(payload.login);
    if (!login) {
      throw new BadRequestException("Введите номер телефона");
    }

    const user = await this.userRepository.findByLogin(login);
    if (user?.role === "driver" && user.status === "active" && this.notificationsCreateService) {
      await this.notificationsCreateService
        .createManagerPasswordResetRequested(user.requestUserId, login)
        .catch(() => undefined);
    }

    return { accepted: true };
  }

  async logout(payload: LogoutRequest): Promise<LogoutResponse> {
    const token = verifyRefreshToken(payload.refreshToken);
    if (!token) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const user = await this.userRepository.findByRequestPrincipal(token.sub, token.role);
    if (
      !user
      || user.status !== "active"
      || token.sessionVersion !== user.refreshTokenVersion
    ) {
      throw new UnauthorizedException("Invalid refresh token");
    }

    await this.userRepository.revokeRefreshSession(user.id);

    return {
      revoked: true,
    };
  }

  private normalizePhoneLogin(value: string): string {
    const trimmed = value.trim();
    if (!trimmed || trimmed.includes("@") || trimmed.startsWith("+")) {
      return trimmed;
    }

    let digits = trimmed.replace(/\D/g, "");
    if (digits.startsWith("996")) {
      return `+${digits}`;
    }

    if (digits.startsWith("0")) {
      digits = digits.slice(1);
    }

    return digits ? `+996${digits}` : trimmed;
  }
}
