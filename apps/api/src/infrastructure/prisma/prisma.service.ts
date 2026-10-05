import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private prismaClient: any | null = null;
  private readonly packageAvailable = this.checkPackageAvailability();

  async onModuleInit() {
    await this.client?.$connect?.();
  }

  async onModuleDestroy() {
    await this.client?.$disconnect?.();
  }

  get isConfigured() {
    return Boolean(process.env.DATABASE_URL) && this.packageAvailable;
  }

  get client(): any | null {
    if (!this.isConfigured) {
      return null;
    }

    if (!this.prismaClient) {
      const { PrismaClient } = require("@prisma/client");
      this.prismaClient = new PrismaClient();
    }

    return this.prismaClient;
  }

  private checkPackageAvailability(): boolean {
    try {
      require.resolve("@prisma/client");
      return true;
    } catch {
      return false;
    }
  }
}
