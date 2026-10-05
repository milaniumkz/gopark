import type {
  AuthRateLimitDecision,
  AuthRateLimitRepository,
  RegisterAuthRateLimitAttemptInput,
} from "../../common/repositories/index.js";
import type { PrismaService } from "../prisma/prisma.service.js";

export class AuthRateLimitPrismaRepository implements AuthRateLimitRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getRetryAfterSeconds(action: string, keyHash: string, now: Date): Promise<number | null> {
    const prisma = this.prisma.client;
    if (!prisma) {
      return null;
    }

    const record = await prisma.authRateLimit.findFirst({
      where: {
        action,
        keyHash,
        blockedUntil: {
          gt: now,
        },
      },
      orderBy: {
        blockedUntil: "desc",
      },
      select: {
        blockedUntil: true,
      },
    });

    if (!record?.blockedUntil) {
      return null;
    }

    return toRetryAfterSeconds(record.blockedUntil, now);
  }

  async registerAttempt(input: RegisterAuthRateLimitAttemptInput): Promise<AuthRateLimitDecision> {
    const prisma = this.prisma.client;
    if (!prisma) {
      return {
        blocked: false,
        retryAfterSeconds: 0,
      };
    }

    const retryAfterSeconds = await this.getRetryAfterSeconds(input.action, input.keyHash, input.now);
    if (retryAfterSeconds != null) {
      return {
        blocked: true,
        retryAfterSeconds,
      };
    }

    const windowStartedAt = new Date(Math.floor(input.now.getTime() / input.windowMs) * input.windowMs);

    const existing = await prisma.authRateLimit.findUnique({
      where: {
        action_keyHash_windowStartedAt: {
          action: input.action,
          keyHash: input.keyHash,
          windowStartedAt,
        },
      },
      select: {
        id: true,
      },
    });

    const record = existing
      ? await prisma.authRateLimit.update({
        where: { id: existing.id },
        data: {
          attemptCount: {
            increment: 1,
          },
        },
        select: {
          id: true,
          attemptCount: true,
        },
      })
      : await createAttemptRecord(prisma, input.action, input.keyHash, windowStartedAt);

    if (record.attemptCount <= input.maxAttempts) {
      return {
        blocked: false,
        retryAfterSeconds: 0,
      };
    }

    const blockedUntil = new Date(input.now.getTime() + input.blockMs);
    await prisma.authRateLimit.update({
      where: {
        id: record.id,
      },
      data: {
        blockedUntil,
      },
    });

    return {
      blocked: true,
      retryAfterSeconds: toRetryAfterSeconds(blockedUntil, input.now),
    };
  }
}

async function createAttemptRecord(
  prisma: NonNullable<PrismaService["client"]>,
  action: string,
  keyHash: string,
  windowStartedAt: Date,
) {
  try {
    return await prisma.authRateLimit.create({
      data: {
        action,
        keyHash,
        windowStartedAt,
        attemptCount: 1,
      },
      select: {
        id: true,
        attemptCount: true,
      },
    });
  } catch {
    const existing = await prisma.authRateLimit.findUniqueOrThrow({
      where: {
        action_keyHash_windowStartedAt: {
          action,
          keyHash,
          windowStartedAt,
        },
      },
      select: {
        id: true,
      },
    });

    return prisma.authRateLimit.update({
      where: { id: existing.id },
      data: {
        attemptCount: {
          increment: 1,
        },
      },
      select: {
        id: true,
        attemptCount: true,
      },
    });
  }
}

function toRetryAfterSeconds(blockedUntil: Date, now: Date): number {
  return Math.max(1, Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000));
}
