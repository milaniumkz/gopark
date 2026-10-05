import type { CreateAdminUserRequest, UpdateAdminUserRequest, UserAdminListItem, UserRole } from "@gopark/contracts";
import type { CreateDriverAccountInput, UserRepository } from "../../common/repositories/index.js";
import { seedDrivers, seedUsers } from "../../data/seed.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { joinName } from "../prisma/prisma.utils.js";
import { hashPassword } from "../../modules/auth/password.util.js";

export class UserPrismaRepository implements UserRepository {
  constructor(private readonly _prisma: PrismaService) {}

  async listAdmin() {
    return this.listAdminInternal();
  }

  async listAdminByCompany(companyName: string) {
    return this.listAdminInternal(companyName);
  }

  async createAdmin(input: CreateAdminUserRequest) {
    const prisma = this._prisma.client;
    if (prisma) {
      const existing = await prisma.user.findFirst({
        where: { phone: input.phone },
        select: {
          id: true,
          status: true,
        },
      });
      if (existing && existing.status !== "blocked") {
        throw new Error("USER_PHONE_ALREADY_EXISTS");
      }

      const baseData = {
        phone: input.phone,
        companyName: input.companyName ?? null,
        passwordHash: hashPassword(input.password),
        role: input.role,
        customRoleKey: input.customRoleKey?.trim() || null,
        status: "active" as const,
        firstName: input.firstName,
        lastName: input.lastName,
        mfaEnabled: false,
      };
      const managerCreateData = {
        title: joinName(input.firstName, input.lastName) || "Бригадир",
        level: input.managerLevel === "senior" ? "senior" as const : "regular" as const,
        seniorManagerId: input.managerLevel === "senior" ? null : input.seniorManagerId?.trim() || null,
      };
      const updateData = {
        ...baseData,
        ...(input.role === "manager"
          ? {
              manager: {
                upsert: {
                  create: managerCreateData,
                  update: managerCreateData,
                },
              },
            }
          : {}),
      };
      const createData = {
        ...baseData,
        ...(input.role === "manager" ? { manager: { create: managerCreateData } } : {}),
      };

      const user = existing
        ? await prisma.user.update({
            where: { id: existing.id },
            data: updateData,
            select: {
              id: true,
              email: true,
              phone: true,
              companyName: true,
              role: true,
              customRoleKey: true,
              status: true,
              mfaEnabled: true,
              firstName: true,
              lastName: true,
              manager: {
                select: {
                  id: true,
                  level: true,
                  seniorManagerId: true,
                },
              },
            },
          })
        : await prisma.user.create({
            data: createData,
            select: {
              id: true,
              email: true,
              phone: true,
              companyName: true,
              role: true,
              customRoleKey: true,
              status: true,
              mfaEnabled: true,
              firstName: true,
              lastName: true,
              manager: {
                select: {
                  id: true,
                  level: true,
                  seniorManagerId: true,
                },
              },
            },
          });

      return {
        id: user.id,
        login: user.phone ?? user.email ?? user.id,
        role: user.role,
        customRoleKey: user.customRoleKey ?? null,
        status: user.status,
        mfaEnabled: user.mfaEnabled,
        displayName: joinName(user.firstName, user.lastName),
        managerProfileId: user.manager?.id ?? null,
        managerLevel: user.manager?.level ?? null,
        seniorManagerProfileId: user.manager?.seniorManagerId ?? null,
        companyName: user.companyName ?? null,
      };
    }

    const existing = seedUsers.find((item) => item.login === input.phone);
    if (existing && existing.status !== "blocked") {
      throw new Error("USER_PHONE_ALREADY_EXISTS");
    }
    const nextId = existing?.id ?? `usr_${seedUsers.length + 1}`;
    const user = {
      id: nextId,
      login: input.phone,
      password: "",
      passwordHash: hashPassword(input.password),
      requestUserId: nextId,
      refreshTokenVersion: 0,
      role: input.role,
      customRoleKey: input.customRoleKey?.trim() || null,
      status: "active",
      mfaEnabled: false,
      displayName: joinName(input.firstName, input.lastName),
      companyName: input.companyName ?? null,
      managerLevel: input.role === "manager" ? input.managerLevel ?? "regular" : null,
      seniorManagerId: input.role === "manager" ? input.seniorManagerId ?? null : null,
    };

    if (existing) {
      Object.assign(existing, user);
    } else {
      seedUsers.push(user);
    }

    return {
      id: user.id,
      login: user.login,
      role: user.role,
      customRoleKey: user.customRoleKey ?? null,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      displayName: user.displayName,
      managerProfileId: user.role === "manager" ? (user.requestUserId ?? user.id) : null,
      managerLevel: input.role === "manager" ? input.managerLevel ?? "regular" : null,
      seniorManagerProfileId: input.role === "manager" ? input.seniorManagerId ?? null : null,
      companyName: user.companyName ?? null,
    };
  }

  async updateAdmin(userId: string, input: UpdateAdminUserRequest) {
    const prisma = this._prisma.client;
    if (prisma) {
      const user = await prisma.$transaction(async (tx: any) => {
        const current = await tx.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            phone: true,
            companyName: true,
            firstName: true,
            lastName: true,
            driver: {
              select: { id: true },
            },
            manager: {
              select: {
                id: true,
                drivers: { select: { id: true } },
              },
            },
          },
        });

        const nextPhone = input.phone?.trim();
        if (nextPhone && nextPhone !== current?.phone) {
          const existing = await tx.user.findFirst({
            where: {
              phone: nextPhone,
              id: { not: userId },
              status: { not: "blocked" },
            },
            select: { id: true },
          });
          if (existing) {
            throw new Error("USER_PHONE_ALREADY_EXISTS");
          }
        }

        const shouldDetachManager = (input.status === "blocked" || input.role === "driver") && current?.manager?.id;
        const assignedDriversCount = current?.manager?.drivers.length ?? 0;
        if (shouldDetachManager && assignedDriversCount > 0) {
          const nextManagerId = input.reassignManagerId?.trim() || null;
          if (!nextManagerId || nextManagerId === current.manager.id) {
            throw new Error("REASSIGN_MANAGER_REQUIRED");
          }

          const targetManager = await tx.manager.findFirst({
            where: {
              id: nextManagerId,
              user: {
                status: { not: "blocked" },
                ...(current.companyName ? { companyName: current.companyName } : {}),
              },
            },
            select: { id: true },
          });
          if (!targetManager) {
            throw new Error("REASSIGN_MANAGER_NOT_FOUND");
          }

          await tx.driver.updateMany({
            where: { managerId: current.manager.id },
            data: { managerId: nextManagerId },
          });
        }

        if (input.role === "driver") {
          const driverPhone = nextPhone || current?.phone;
          if (!driverPhone) {
            throw new Error("USER_PHONE_ALREADY_EXISTS");
          }
          const existingDriver = await tx.driver.findFirst({
            where: {
              phone: driverPhone,
              ...(current?.driver?.id ? { id: { not: current.driver.id } } : {}),
            },
            select: { id: true },
          });
          if (existingDriver) {
            throw new Error("DRIVER_PHONE_ALREADY_EXISTS");
          }
          if (current?.manager?.id) {
            await tx.manager.updateMany({
              where: { seniorManagerId: current.manager.id },
              data: { seniorManagerId: null },
            });
            await tx.manager.delete({ where: { id: current.manager.id } });
          }

          return tx.user.update({
            where: { id: userId },
            data: {
              role: "driver",
              phone: driverPhone,
              customRoleKey: null,
              status: input.status,
              mfaEnabled: input.mfaEnabled,
              companyName: input.companyName,
              driver: current?.driver
                ? {
                    update: {
                      phone: driverPhone,
                      firstName: current.firstName,
                      lastName: current.lastName,
                      companyName: input.companyName !== undefined ? input.companyName : current.companyName,
                    },
                  }
                : {
                    create: {
                      firstName: current?.firstName ?? "",
                      lastName: current?.lastName ?? "",
                      phone: driverPhone,
                      companyName: input.companyName !== undefined ? input.companyName : current?.companyName ?? null,
                      status: "active",
                      riskStatus: "normal",
                    },
                  },
            },
            select: {
              id: true,
              email: true,
              phone: true,
              companyName: true,
              role: true,
              customRoleKey: true,
              status: true,
              mfaEnabled: true,
              firstName: true,
              lastName: true,
              manager: {
                select: {
                  id: true,
                  level: true,
                  seniorManagerId: true,
                },
              },
            },
          });
        }

        return tx.user.update({
          where: { id: userId },
          data: {
            role: input.role,
            phone: nextPhone || undefined,
            customRoleKey: input.customRoleKey === undefined ? undefined : input.customRoleKey?.trim() || null,
            status: input.status,
            mfaEnabled: input.mfaEnabled,
            companyName: input.companyName,
            ...(input.role === "manager"
              ? {
                  manager: {
                    upsert: {
                      create: {
                        title: "Бригадир",
                        level: input.managerLevel === "senior" ? "senior" : "regular",
                        seniorManagerId: input.managerLevel === "senior" ? null : input.seniorManagerId?.trim() || null,
                      },
                      update: {
                        ...(input.managerLevel ? { level: input.managerLevel } : {}),
                        ...(input.seniorManagerId !== undefined
                          ? { seniorManagerId: input.managerLevel === "senior" ? null : input.seniorManagerId?.trim() || null }
                          : {}),
                      },
                    },
                  },
                }
              : {}),
          },
          select: {
            id: true,
            email: true,
            phone: true,
            companyName: true,
            role: true,
            customRoleKey: true,
            status: true,
            mfaEnabled: true,
            firstName: true,
            lastName: true,
            manager: {
              select: {
                id: true,
                level: true,
                seniorManagerId: true,
              },
            },
          },
        });
      });

      return {
        id: user.id,
        login: user.email ?? user.phone ?? user.id,
        role: user.role,
        customRoleKey: user.customRoleKey ?? null,
        status: user.status,
        mfaEnabled: user.mfaEnabled,
        displayName: joinName(user.firstName, user.lastName),
        managerProfileId: user.manager?.id ?? null,
        managerLevel: user.manager?.level ?? null,
        seniorManagerProfileId: user.manager?.seniorManagerId ?? null,
        companyName: user.companyName ?? null,
      };
    }

    const user = seedUsers.find((item) => item.id === userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    if (input.role) {
      user.role = input.role;
    }
    if (input.phone?.trim() && input.phone.trim() !== user.login) {
      const existing = seedUsers.find((item) => item.id !== userId && item.login === input.phone?.trim() && item.status !== "blocked");
      if (existing) {
        throw new Error("USER_PHONE_ALREADY_EXISTS");
      }
      user.login = input.phone.trim();
    }
    if (input.customRoleKey !== undefined) {
      user.customRoleKey = input.customRoleKey?.trim() || null;
    }
    if (input.status) {
      user.status = input.status;
    }
    if (input.status === "blocked" && user.role === "manager") {
      const managerProfileId = user.requestUserId ?? user.id;
      const assignedDrivers = seedDrivers.filter((item) => item.managerId === managerProfileId);
      if (assignedDrivers.length) {
        const nextManagerId = input.reassignManagerId?.trim() || null;
        if (!nextManagerId || nextManagerId === managerProfileId) {
          throw new Error("REASSIGN_MANAGER_REQUIRED");
        }
        for (const driver of assignedDrivers) {
          driver.managerId = nextManagerId;
        }
      }
    }
    if (typeof input.mfaEnabled === "boolean") {
      user.mfaEnabled = input.mfaEnabled;
    }
    if (input.companyName !== undefined) {
      user.companyName = input.companyName;
    }
    if (user.role === "manager") {
      user.managerLevel = input.managerLevel ?? user.managerLevel ?? "regular";
      user.seniorManagerId = user.managerLevel === "senior" ? null : input.seniorManagerId ?? user.seniorManagerId ?? null;
    } else {
      user.managerLevel = null;
      user.seniorManagerId = null;
    }

    return {
      id: user.id,
      login: user.login,
      role: user.role,
      customRoleKey: user.customRoleKey ?? null,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      displayName: user.displayName,
      managerProfileId: user.role === "manager" ? (user.requestUserId ?? user.id) : null,
      managerLevel: user.role === "manager" ? user.managerLevel ?? "regular" : null,
      seniorManagerProfileId: user.role === "manager" ? user.seniorManagerId ?? null : null,
      companyName: user.companyName ?? null,
    };
  }

  async createDriverAccount(input: CreateDriverAccountInput) {
    const prisma = this._prisma.client;
    if (prisma) {
      const [existingUser, existingDriver] = await Promise.all([
        prisma.user.findFirst({
          where: { phone: input.phone },
          select: { id: true },
        }),
        prisma.driver.findFirst({
          where: { phone: input.phone },
          select: { id: true },
        }),
      ]);

      if (existingUser || existingDriver) {
        throw new Error("DRIVER_PHONE_ALREADY_EXISTS");
      }

      const created = await prisma.user.create({
        data: {
          phone: input.phone,
          companyName: input.companyName ?? null,
          passwordHash: hashPassword(input.password),
          mustChangePassword: input.mustChangePassword ?? false,
          role: "driver",
          status: "active",
          firstName: input.firstName,
          lastName: input.lastName,
          mfaEnabled: false,
          driver: {
            create: {
              firstName: input.firstName,
              lastName: input.lastName,
              phone: input.phone,
              nearestRelativePhone: input.nearestRelativePhone?.trim() || null,
              companyName: input.companyName ?? null,
              managerId: input.managerId?.trim() || null,
              licenseNumber: input.licenseNumber?.trim() || null,
              passportNumber: input.passportNumber?.trim() || null,
              weeklyDayOff: input.weeklyDayOff?.trim() || null,
              status: "active",
            },
          },
        },
        select: {
          id: true,
          email: true,
          phone: true,
          companyName: true,
          refreshTokenVersion: true,
          role: true,
          customRoleKey: true,
          status: true,
          mfaEnabled: true,
          firstName: true,
          lastName: true,
          passwordHash: true,
          mustChangePassword: true,
          driver: {
            select: {
              id: true,
            },
          },
          manager: {
            select: {
              id: true,
              level: true,
              seniorManagerId: true,
            },
          },
        },
      });

      return {
        id: created.id,
        login: created.email ?? created.phone ?? created.id,
        role: created.role,
        customRoleKey: created.customRoleKey ?? null,
        status: created.status,
        mfaEnabled: created.mfaEnabled,
        displayName: joinName(created.firstName, created.lastName),
        companyName: created.companyName ?? null,
        passwordHash: created.passwordHash,
        mustChangePassword: created.mustChangePassword,
        requestUserId: resolveRequestUserId(created),
        refreshTokenVersion: created.refreshTokenVersion,
      };
    }

    const existing = seedUsers.find((item) => item.login === input.phone || item.requestUserId === input.phone);
    if (existing || seedDrivers.some((item) => item.phone === input.phone)) {
      throw new Error("DRIVER_PHONE_ALREADY_EXISTS");
    }

    const nextUserId = `usr_${seedUsers.length + 1}`;
    const nextDriverId = `drv_${seedDrivers.length + 1}`;
    const displayName = joinName(input.firstName, input.lastName);

    seedUsers.push({
      id: nextUserId,
      login: input.phone,
      password: "",
      passwordHash: hashPassword(input.password),
      mustChangePassword: input.mustChangePassword ?? false,
      requestUserId: nextDriverId,
      refreshTokenVersion: 0,
      role: "driver",
      status: "active",
      mfaEnabled: false,
      displayName,
      companyName: input.companyName ?? null,
    });

    seedDrivers.push({
      id: nextDriverId,
      fullName: displayName,
      phone: input.phone,
      nearestRelativePhone: input.nearestRelativePhone?.trim() || null,
      licenseNumber: input.licenseNumber?.trim() || null,
      passportNumber: input.passportNumber?.trim() || null,
      companyName: input.companyName ?? null,
      weeklyDayOff: input.weeklyDayOff?.trim() || null,
      status: "active",
      riskStatus: "normal",
      managerId: input.managerId?.trim() || null,
      activeContractId: null,
      creditBalance: 0,
    });

    return {
      id: nextUserId,
      login: input.phone,
      role: "driver",
      customRoleKey: null,
      status: "active",
      mfaEnabled: false,
      displayName,
      companyName: input.companyName ?? null,
      passwordHash: seedUsers[seedUsers.length - 1].passwordHash ?? null,
      mustChangePassword: seedUsers[seedUsers.length - 1].mustChangePassword ?? false,
      requestUserId: nextDriverId,
      refreshTokenVersion: 0,
    };
  }

  async changePassword(userId: string, password: string) {
    const prisma = this._prisma.client;
    if (prisma) {
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash: hashPassword(password),
          mustChangePassword: false,
          refreshTokenVersion: { increment: 1 },
        },
        select: {
          id: true,
          email: true,
          phone: true,
          companyName: true,
          refreshTokenVersion: true,
          role: true,
          customRoleKey: true,
          status: true,
          mfaEnabled: true,
          firstName: true,
          lastName: true,
          passwordHash: true,
          mustChangePassword: true,
          driver: {
            select: {
              id: true,
            },
          },
          manager: {
            select: {
              id: true,
              level: true,
              seniorManagerId: true,
            },
          },
        },
      });

      return {
        id: user.id,
        login: user.email ?? user.phone ?? user.id,
        role: user.role,
        customRoleKey: user.customRoleKey ?? null,
        status: user.status,
        mfaEnabled: user.mfaEnabled,
        displayName: joinName(user.firstName, user.lastName),
        companyName: user.companyName ?? null,
        passwordHash: user.passwordHash,
        mustChangePassword: user.mustChangePassword,
        requestUserId: resolveRequestUserId(user),
        refreshTokenVersion: user.refreshTokenVersion,
      };
    }

    const user = seedUsers.find((item) => item.id === userId);
    if (!user) {
      throw new Error("USER_NOT_FOUND");
    }

    user.password = "";
    user.passwordHash = hashPassword(password);
    user.mustChangePassword = false;
    user.refreshTokenVersion = (user.refreshTokenVersion ?? 0) + 1;

    return {
      id: user.id,
      login: user.login,
      role: user.role,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      displayName: user.displayName,
      companyName: user.companyName ?? null,
      passwordHash: user.passwordHash,
      mustChangePassword: user.mustChangePassword,
      requestUserId: user.requestUserId ?? user.id,
      refreshTokenVersion: user.refreshTokenVersion ?? 0,
    };
  }

  async resetDriverPassword(driverId: string, password: string) {
    const prisma = this._prisma.client;
    if (prisma) {
      const existing = await prisma.user.findFirst({
        where: {
          role: "driver",
          driver: {
            id: driverId,
          },
        },
        select: { id: true },
      });

      if (!existing) {
        return null;
      }

      const user = await prisma.user.update({
        where: { id: existing.id },
        data: {
          passwordHash: hashPassword(password),
          mustChangePassword: true,
          refreshTokenVersion: { increment: 1 },
        },
        select: {
          id: true,
          email: true,
          phone: true,
          companyName: true,
          refreshTokenVersion: true,
          role: true,
          customRoleKey: true,
          status: true,
          mfaEnabled: true,
          firstName: true,
          lastName: true,
          passwordHash: true,
          mustChangePassword: true,
          driver: {
            select: {
              id: true,
            },
          },
          manager: {
            select: {
              id: true,
              level: true,
              seniorManagerId: true,
            },
          },
        },
      });

      return {
        id: user.id,
        login: user.email ?? user.phone ?? user.id,
        role: user.role,
        customRoleKey: user.customRoleKey ?? null,
        status: user.status,
        mfaEnabled: user.mfaEnabled,
        displayName: joinName(user.firstName, user.lastName),
        companyName: user.companyName ?? null,
        passwordHash: user.passwordHash,
        mustChangePassword: user.mustChangePassword,
        requestUserId: resolveRequestUserId(user),
        refreshTokenVersion: user.refreshTokenVersion,
      };
    }

    const user = seedUsers.find((item) => item.role === "driver" && item.requestUserId === driverId);
    if (!user) {
      return null;
    }

    user.password = "";
    user.passwordHash = hashPassword(password);
    user.mustChangePassword = true;
    user.refreshTokenVersion = (user.refreshTokenVersion ?? 0) + 1;

    return {
      id: user.id,
      login: user.login,
      role: user.role,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      displayName: user.displayName,
      companyName: user.companyName ?? null,
      passwordHash: user.passwordHash,
      mustChangePassword: user.mustChangePassword,
      requestUserId: user.requestUserId ?? user.id,
      refreshTokenVersion: user.refreshTokenVersion ?? 0,
    };
  }

  private async listAdminInternal(companyName?: string) {
    const prisma = this._prisma.client;
    if (prisma) {
      const users = await prisma.user.findMany({
        where: companyName ? { companyName } : undefined,
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          email: true,
          phone: true,
          companyName: true,
          refreshTokenVersion: true,
          role: true,
          customRoleKey: true,
          status: true,
          mfaEnabled: true,
          firstName: true,
          lastName: true,
          manager: {
            select: {
              id: true,
              level: true,
              seniorManagerId: true,
            },
          },
        },
      });

      return users.map((item: any) => ({
        id: item.id,
        login: item.email ?? item.phone ?? item.id,
        role: item.role,
        customRoleKey: item.customRoleKey ?? null,
        status: item.status,
        mfaEnabled: item.mfaEnabled,
        displayName: joinName(item.firstName, item.lastName),
        managerProfileId: item.manager?.id ?? null,
        managerLevel: item.manager?.level ?? null,
        seniorManagerProfileId: item.manager?.seniorManagerId ?? null,
        companyName: item.companyName ?? null,
      }));
    }

    return seedUsers
      .filter((item) => !companyName || (item.companyName ?? null) === companyName)
      .map((item) => ({
      id: item.id,
      login: item.login,
      role: item.role,
      customRoleKey: item.customRoleKey ?? null,
      status: item.status,
      mfaEnabled: item.mfaEnabled,
      displayName: item.displayName,
      managerProfileId: item.role === "manager" ? (item.requestUserId ?? item.id) : null,
      managerLevel: item.role === "manager" ? item.managerLevel ?? "regular" : null,
      seniorManagerProfileId: item.role === "manager" ? item.seniorManagerId ?? null : null,
      companyName: item.companyName ?? null,
    }));
  }

  async getManagerProfile(requestUserId: string, companyName?: string | null): Promise<UserAdminListItem | null> {
    const users = companyName ? await this.listAdminByCompany(companyName) : await this.listAdmin();
    return users.find((item: UserAdminListItem) => (
      item.role === "manager"
      && (item.id === requestUserId || item.managerProfileId === requestUserId)
    )) ?? null;
  }

  async getManagerScopeIds(requestUserId: string, companyName?: string | null): Promise<Set<string>> {
    const users = companyName ? await this.listAdminByCompany(companyName) : await this.listAdmin();
    const manager = users.find((item: UserAdminListItem) => (
      item.role === "manager"
      && (item.id === requestUserId || item.managerProfileId === requestUserId)
    ));
    const ids = new Set<string>([requestUserId]);
    if (!manager) {
      return ids;
    }

    if (manager.id) {
      ids.add(manager.id);
    }
    if (manager.managerProfileId) {
      ids.add(manager.managerProfileId);
    }

    if (manager.managerLevel === "senior") {
      users
        .filter((item: UserAdminListItem) => item.role === "manager" && item.managerLevel !== "senior")
        .forEach((item: UserAdminListItem) => {
          ids.add(item.id);
          if (item.managerProfileId) {
            ids.add(item.managerProfileId);
          }
        });
    }

    return ids;
  }

  async findByLogin(login: string) {
    const prisma = this._prisma.client;
    if (prisma) {
      const user = await prisma.user.findFirst({
        where: {
          OR: [
            { email: login },
            { phone: login },
          ],
        },
        select: {
          id: true,
          email: true,
          phone: true,
          companyName: true,
          refreshTokenVersion: true,
          role: true,
          status: true,
          mfaEnabled: true,
          firstName: true,
          lastName: true,
          passwordHash: true,
          mustChangePassword: true,
          driver: {
            select: {
              id: true,
            },
          },
          manager: {
            select: {
              id: true,
            },
          },
        },
      });

      return user
        ? {
            id: user.id,
            login: user.email ?? user.phone ?? user.id,
            role: user.role,
            customRoleKey: user.customRoleKey ?? null,
            status: user.status,
            mfaEnabled: user.mfaEnabled,
            displayName: joinName(user.firstName, user.lastName),
            companyName: user.companyName ?? null,
            passwordHash: user.passwordHash,
            mustChangePassword: user.mustChangePassword,
            requestUserId: resolveRequestUserId(user),
            refreshTokenVersion: user.refreshTokenVersion,
          }
        : null;
    }

    const user = seedUsers.find((item) => item.login === login) ?? null;
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      login: user.login,
      role: user.role,
      customRoleKey: user.customRoleKey ?? null,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      displayName: user.displayName,
      companyName: user.companyName ?? null,
      passwordHash: user.passwordHash ?? null,
      legacyPassword: user.password,
      mustChangePassword: user.mustChangePassword ?? false,
      requestUserId: user.requestUserId ?? user.id,
      refreshTokenVersion: user.refreshTokenVersion ?? 0,
    };
  }

  async findByRequestPrincipal(requestUserId: string, role: UserRole) {
    const prisma = this._prisma.client;
    if (prisma) {
      const user = await prisma.user.findFirst({
        where: buildRequestPrincipalWhere(requestUserId, role),
        select: {
          id: true,
          email: true,
          phone: true,
          companyName: true,
          refreshTokenVersion: true,
          role: true,
          customRoleKey: true,
          status: true,
          mfaEnabled: true,
          firstName: true,
          lastName: true,
          passwordHash: true,
          mustChangePassword: true,
          driver: {
            select: {
              id: true,
            },
          },
          manager: {
            select: {
              id: true,
            },
          },
        },
      });

      return user
        ? {
            id: user.id,
            login: user.email ?? user.phone ?? user.id,
            role: user.role,
            customRoleKey: user.customRoleKey ?? null,
            status: user.status,
            mfaEnabled: user.mfaEnabled,
            displayName: joinName(user.firstName, user.lastName),
            companyName: user.companyName ?? null,
            passwordHash: user.passwordHash,
            mustChangePassword: user.mustChangePassword,
            requestUserId: resolveRequestUserId(user),
            refreshTokenVersion: user.refreshTokenVersion,
          }
        : null;
    }

    const user = seedUsers.find((item) => item.requestUserId === requestUserId && item.role === role) ?? null;
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      login: user.login,
      role: user.role,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      displayName: user.displayName,
      companyName: user.companyName ?? null,
      passwordHash: user.passwordHash ?? null,
      legacyPassword: user.password,
      mustChangePassword: user.mustChangePassword ?? false,
      requestUserId: user.requestUserId ?? user.id,
      refreshTokenVersion: user.refreshTokenVersion ?? 0,
    };
  }

  async issueRefreshSession(userId: string) {
    const prisma = this._prisma.client;
    if (prisma) {
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          refreshTokenVersion: { increment: 1 },
          lastLoginAt: new Date(),
        },
        select: {
          refreshTokenVersion: true,
        },
      });

      return user.refreshTokenVersion;
    }

    const user = seedUsers.find((item) => item.id === userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    user.refreshTokenVersion = (user.refreshTokenVersion ?? 0) + 1;
    return user.refreshTokenVersion;
  }

  async rotateRefreshSession(userId: string) {
    return this.issueRefreshSession(userId);
  }

  async revokeRefreshSession(userId: string) {
    const prisma = this._prisma.client;
    if (prisma) {
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          refreshTokenVersion: { increment: 1 },
        },
        select: {
          refreshTokenVersion: true,
        },
      });

      return user.refreshTokenVersion;
    }

    const user = seedUsers.find((item) => item.id === userId);
    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    user.refreshTokenVersion = (user.refreshTokenVersion ?? 0) + 1;
    return user.refreshTokenVersion;
  }
}

function buildRequestPrincipalWhere(requestUserId: string, role: UserRole) {
  if (role === "driver") {
    return {
      role,
      driver: {
        id: requestUserId,
      },
    };
  }

  if (role === "manager") {
    return {
      role,
      manager: {
        id: requestUserId,
      },
    };
  }

  return {
    id: requestUserId,
    role,
  };
}

function resolveRequestUserId(user: {
  id: string;
  role: UserRole;
  driver?: { id: string } | null;
  manager?: { id: string } | null;
}): string {
  if (user.role === "driver") {
    return user.driver?.id ?? user.id;
  }

  if (user.role === "manager") {
    return user.manager?.id ?? user.id;
  }

  return user.id;
}
