import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type { CreateAdminUserRequest, UpdateAdminUserRequest, UserAdminListItem } from "@gopark/contracts";
import { makeUserRepository } from "../../common/application/repository.factory.js";
import type { UserRepository } from "../../common/repositories/index.js";
import { AuditLogService } from "../audit/audit-log.service.js";
import type { RequestUser } from "../rbac/request-user.js";

@Injectable()
export class UsersService {
  private readonly userRepository: UserRepository = makeUserRepository();

  constructor(private readonly auditLogService: AuditLogService) {}

  listAdmin(): Promise<UserAdminListItem[]> {
    return this.userRepository.listAdmin();
  }

  listAdminByCompany(companyName: string): Promise<UserAdminListItem[]> {
    return this.userRepository.listAdminByCompany(companyName);
  }

  async createAdmin(input: CreateAdminUserRequest, currentUser?: RequestUser | null): Promise<UserAdminListItem> {
    try {
      const user = await this.userRepository.createAdmin(input);
      await this.auditLogService.write("user.created", "user", user.id, {
        afterData: {
          actor: currentUser ? serializeAuditActor(currentUser) : null,
          user,
        },
      });
      return user;
    } catch (error) {
      if (error instanceof Error && error.message === "USER_PHONE_ALREADY_EXISTS") {
        throw new ConflictException("Номер телефона уже зарегистрирован.");
      }
      if (error instanceof Error && error.message === "DRIVER_PHONE_ALREADY_EXISTS") {
        throw new ConflictException("Водитель с таким номером уже зарегистрирован.");
      }
      throw error;
    }
  }

  async updateAdmin(userId: string, input: UpdateAdminUserRequest, currentUser?: RequestUser | null): Promise<UserAdminListItem> {
    try {
      const before = (await this.userRepository.listAdmin()).find((item) => item.id === userId) ?? null;
      const user = await this.userRepository.updateAdmin(userId, input);
      await this.auditLogService.write(input.status === "blocked" ? "user.blocked" : "user.updated", "user", userId, {
        beforeData: { user: before },
        afterData: {
          actor: currentUser ? serializeAuditActor(currentUser) : null,
          changes: input as Record<string, unknown>,
          user,
        },
      });
      return user;
    } catch (error) {
      if (error instanceof Error && error.message === "USER_PHONE_ALREADY_EXISTS") {
        throw new ConflictException("Номер телефона уже зарегистрирован.");
      }
      if (error instanceof Error && error.message === "REASSIGN_MANAGER_REQUIRED") {
        throw new BadRequestException("Выберите бригадира, которому передать водителей.");
      }
      if (error instanceof Error && error.message === "REASSIGN_MANAGER_NOT_FOUND") {
        throw new BadRequestException("Новый бригадир не найден или недоступен.");
      }
      throw error;
    }
  }
}

function serializeAuditActor(currentUser: RequestUser): Record<string, unknown> {
  return {
    id: currentUser.id,
    role: currentUser.role,
    companyName: currentUser.companyName ?? null,
    managerLevel: currentUser.managerLevel ?? null,
    customRoleKey: currentUser.customRoleKey ?? null,
  };
}
