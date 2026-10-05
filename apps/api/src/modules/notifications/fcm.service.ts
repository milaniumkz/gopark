import { Injectable } from "@nestjs/common";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import type { UserRole } from "@gopark/contracts";

const require = createRequire(import.meta.url);

@Injectable()
export class FcmService {
  private admin: any | null | undefined;
  private readonly recentlySent = new Map<string, number>();

  constructor(private readonly prisma: PrismaService) {}

  async registerToken(input: {
    userId: string;
    role?: UserRole;
    token: string;
    platform: string;
    app: string;
  }): Promise<{ ok: true }> {
    const prisma = this.prisma.client;
    if (!prisma) {
      return { ok: true };
    }

    const userId = await this.resolveTokenUserId(input.userId, input.role);
    if (!userId) {
      return { ok: true };
    }

    await prisma.devicePushToken.upsert({
      where: { token: input.token },
      create: {
        userId,
        token: input.token,
        platform: input.platform,
        app: input.app,
      },
      update: {
        userId,
        platform: input.platform,
        app: input.app,
        lastSeenAt: new Date(),
        disabledAt: null,
      },
    });

    return { ok: true };
  }

  async sendToDriver(driverId: string, title: string, body: string): Promise<void> {
    const prisma = this.prisma.client;
    if (!prisma) {
      return;
    }

    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { userId: true },
    });
    if (!driver?.userId) {
      return;
    }

    await this.sendToUsers([driver.userId], title, body);
  }

  async sendToManager(managerId: string | null | undefined, title: string, body: string): Promise<void> {
    if (!managerId) {
      return;
    }

    const prisma = this.prisma.client;
    if (!prisma) {
      return;
    }

    const manager = await prisma.manager.findUnique({
      where: { id: managerId },
      select: { userId: true },
    });
    if (!manager?.userId) {
      return;
    }

    await this.sendToUsers([manager.userId], title, body);
  }

  async sendToCrmStaffByManager(
    managerId: string | null | undefined,
    title: string,
    body: string,
  ): Promise<void> {
    const prisma = this.prisma.client;
    if (!prisma) {
      return;
    }

    const manager = managerId
      ? await prisma.manager.findUnique({
          where: { id: managerId },
          select: { user: { select: { companyName: true } } },
        })
      : null;
    const companyName = manager?.user?.companyName ?? null;
    const users = await prisma.user.findMany({
      where: {
        status: "active",
        ...(companyName ? { companyName } : {}),
        OR: [
          { role: { in: ["owner", "admin", "operator", "finance", "auditor"] } },
          { role: "manager", managerLevel: "senior" },
        ],
      },
      select: { id: true },
    });

    await this.sendToUsers(users.map((user: { id: string }) => user.id), title, body);
  }

  async sendToCrmStaffByDriver(
    driverId: string,
    title: string,
    body: string,
  ): Promise<void> {
    const prisma = this.prisma.client;
    if (!prisma) {
      return;
    }

    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { companyName: true },
    });
    await this.sendToCrmStaffByCompany(driver?.companyName ?? null, title, body);
  }

  async sendToCrmStaffByCompany(
    companyName: string | null | undefined,
    title: string,
    body: string,
  ): Promise<void> {
    const prisma = this.prisma.client;
    if (!prisma) {
      return;
    }

    const users = await prisma.user.findMany({
      where: {
        status: "active",
        ...(companyName ? { companyName } : {}),
        OR: [
          { role: { in: ["owner", "admin", "operator", "finance", "auditor"] } },
          { role: "manager", managerLevel: "senior" },
        ],
      },
      select: { id: true },
    });

    await this.sendToUsers(users.map((user: { id: string }) => user.id), title, body);
  }

  private async sendToUsers(userIds: string[], title: string, body: string): Promise<void> {
    const admin = this.getAdmin();
    const prisma = this.prisma.client;
    if (!admin || !prisma || userIds.length === 0) {
      return;
    }
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueUserIds.length === 0) {
      return;
    }

    const tokens = await prisma.devicePushToken.findMany({
      where: {
        userId: { in: uniqueUserIds },
        disabledAt: null,
      },
      select: { token: true },
    });
    const now = Date.now();
    this.cleanupRecentlySent(now);
    const uniqueTokens = [...new Set(tokens.map((item: { token: string }) => item.token).filter(Boolean))]
      .filter((token) => {
        const key = `${token}:${title}:${body}`;
        if (this.recentlySent.has(key)) {
          return false;
        }
        this.recentlySent.set(key, now);
        return true;
      });
    if (uniqueTokens.length === 0) {
      return;
    }

    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: uniqueTokens,
        notification: { title, body },
        android: {
          priority: "high",
          notification: {
            channelId: "gopark_alerts",
            sound: "default",
          },
        },
        data: {
          source: "gopark",
        },
      });

      const invalidTokens = response.responses
        .map((item: { success: boolean; error?: Error }, index: number) => ({ item, token: uniqueTokens[index] }))
        .filter(({ item }: { item: { success: boolean; error?: Error }; token?: string }) => !item.success)
        .map(({ token }: { item: { success: boolean; error?: Error }; token?: string }) => token)
        .filter(Boolean) as string[];

      if (invalidTokens.length > 0) {
        console.warn(`[gopark-api] FCM disabled ${invalidTokens.length} invalid push token(s)`);
        await prisma.devicePushToken.updateMany({
          where: { token: { in: invalidTokens } },
          data: { disabledAt: new Date() },
        });
      }
    } catch (error) {
      console.warn(`[gopark-api] FCM send failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private cleanupRecentlySent(now: number): void {
    const ttlMs = 3000;
    for (const [key, timestamp] of this.recentlySent.entries()) {
      if (now - timestamp > ttlMs) {
        this.recentlySent.delete(key);
      }
    }
  }

  private async resolveTokenUserId(principalId: string, role?: UserRole): Promise<string | null> {
    const prisma = this.prisma.client;
    if (!prisma) {
      return null;
    }

    if (role === "driver") {
      const driver = await prisma.driver.findUnique({
        where: { id: principalId },
        select: { userId: true },
      });
      return driver?.userId ?? null;
    }

    if (role === "manager") {
      const manager = await prisma.manager.findUnique({
        where: { id: principalId },
        select: { userId: true },
      });
      return manager?.userId ?? null;
    }

    const user = await prisma.user.findUnique({
      where: { id: principalId },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  private getAdmin(): any | null {
    if (this.admin !== undefined) {
      return this.admin;
    }

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (!serviceAccountJson && !serviceAccountPath) {
      console.warn("[gopark-api] FCM disabled: FIREBASE_SERVICE_ACCOUNT_JSON/PATH is not configured");
      this.admin = null;
      return null;
    }

    try {
      const firebaseApp = require("firebase-admin/app") as any;
      const firebaseMessaging = require("firebase-admin/messaging") as any;
      const credentialSource = serviceAccountJson
        ? JSON.parse(serviceAccountJson)
        : JSON.parse(readFileSync(serviceAccountPath as string, "utf8"));

      if (firebaseApp.getApps().length === 0) {
        firebaseApp.initializeApp({
          credential: firebaseApp.cert(credentialSource),
        });
      }

      this.admin = {
        messaging: () => firebaseMessaging.getMessaging(),
      };
      return this.admin;
    } catch (error) {
      console.warn(`[gopark-api] FCM disabled: ${error instanceof Error ? error.message : String(error)}`);
      this.admin = null;
      return null;
    }
  }
}
