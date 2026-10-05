import type {
  AuthRateLimitRepository,
  AuditRepository,
  CarRepository,
  ContractRepository,
  DriverRepository,
  DriverCreditBalanceRepository,
  IncidentRepository,
  LedgerRepository,
  ManagerAlertRepository,
  NotificationRepository,
  ObligationRepository,
  OutboxRepository,
  PaymentRepository,
  PayoutRepository,
  QuickActionRepository,
  SettingsRepository,
  StatusRequestRepository,
  UserRepository,
  YandexBalanceRepository,
} from "../repositories/index.js";
import {
  InMemoryAuthRateLimitRepository,
  InMemoryAuditRepository,
  InMemoryCarRepository,
  InMemoryContractRepository,
  InMemoryDriverCreditBalanceRepository,
  InMemoryDriverRepository,
  InMemoryIncidentRepository,
  InMemoryLedgerRepository,
  InMemoryManagerAlertRepository,
  InMemoryNotificationRepository,
  InMemoryObligationRepository,
  InMemoryOutboxRepository,
  InMemoryPaymentRepository,
  InMemoryPayoutRepository,
  InMemoryQuickActionRepository,
  InMemorySettingsRepository,
  InMemoryStatusRequestRepository,
  InMemoryUserRepository,
  InMemoryYandexBalanceRepository,
} from "./in-memory.repositories.js";
import {
  AuthRateLimitPrismaRepository,
  AuditPrismaRepository,
  CarPrismaRepository,
  ContractPrismaRepository,
  DriverCreditBalancePrismaRepository,
  DriverPrismaRepository,
  IncidentPrismaRepository,
  LedgerPrismaRepository,
  ManagerAlertPrismaRepository,
  NotificationPrismaRepository,
  ObligationPrismaRepository,
  OutboxPrismaRepository,
  PaymentPrismaRepository,
  PayoutPrismaRepository,
  QuickActionPrismaRepository,
  SettingsPrismaRepository,
  StatusRequestPrismaRepository,
  UserPrismaRepository,
  YandexBalancePrismaRepository,
} from "../../infrastructure/repositories/index.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";

const prismaService = new PrismaService();

function shouldUsePrisma(): boolean {
  return prismaService.isConfigured;
}

export function makeDriverRepository(): DriverRepository {
  if (shouldUsePrisma()) {
    return new DriverPrismaRepository(prismaService);
  }

  return new InMemoryDriverRepository();
}

export function makeDriverCreditBalanceRepository(): DriverCreditBalanceRepository {
  if (shouldUsePrisma()) {
    return new DriverCreditBalancePrismaRepository(prismaService);
  }

  return new InMemoryDriverCreditBalanceRepository();
}

export function makeAuthRateLimitRepository(): AuthRateLimitRepository {
  if (shouldUsePrisma()) {
    return new AuthRateLimitPrismaRepository(prismaService);
  }

  return new InMemoryAuthRateLimitRepository();
}

export function makeCarRepository(): CarRepository {
  if (shouldUsePrisma()) {
    return new CarPrismaRepository(prismaService);
  }

  return new InMemoryCarRepository();
}

export function makeContractRepository(): ContractRepository {
  if (shouldUsePrisma()) {
    return new ContractPrismaRepository(prismaService);
  }

  return new InMemoryContractRepository();
}

export function makePaymentRepository(): PaymentRepository {
  if (shouldUsePrisma()) {
    return new PaymentPrismaRepository(prismaService);
  }

  return new InMemoryPaymentRepository();
}

export function makePayoutRepository(): PayoutRepository {
  if (shouldUsePrisma()) {
    return new PayoutPrismaRepository(prismaService);
  }

  return new InMemoryPayoutRepository();
}

export function makeObligationRepository(): ObligationRepository {
  if (shouldUsePrisma()) {
    return new ObligationPrismaRepository(prismaService);
  }

  return new InMemoryObligationRepository();
}

export function makeLedgerRepository(): LedgerRepository {
  if (shouldUsePrisma()) {
    return new LedgerPrismaRepository(prismaService);
  }

  return new InMemoryLedgerRepository();
}

export function makeAuditRepository(): AuditRepository {
  if (shouldUsePrisma()) {
    return new AuditPrismaRepository(prismaService);
  }

  return new InMemoryAuditRepository();
}

export function makeNotificationRepository(): NotificationRepository {
  if (shouldUsePrisma()) {
    return new NotificationPrismaRepository(prismaService);
  }

  return new InMemoryNotificationRepository();
}

export function makeOutboxRepository(): OutboxRepository {
  if (shouldUsePrisma()) {
    return new OutboxPrismaRepository(prismaService);
  }

  return new InMemoryOutboxRepository();
}

export function makeStatusRequestRepository(): StatusRequestRepository {
  if (shouldUsePrisma()) {
    return new StatusRequestPrismaRepository(prismaService);
  }

  return new InMemoryStatusRequestRepository();
}

export function makeIncidentRepository(): IncidentRepository {
  if (shouldUsePrisma()) {
    return new IncidentPrismaRepository(prismaService);
  }

  return new InMemoryIncidentRepository();
}

export function makeUserRepository(): UserRepository {
  if (shouldUsePrisma()) {
    return new UserPrismaRepository(prismaService);
  }

  return new InMemoryUserRepository();
}

export function makeManagerAlertRepository(): ManagerAlertRepository {
  if (shouldUsePrisma()) {
    return new ManagerAlertPrismaRepository(prismaService);
  }

  return new InMemoryManagerAlertRepository();
}

export function makeQuickActionRepository(): QuickActionRepository {
  if (shouldUsePrisma()) {
    return new QuickActionPrismaRepository(prismaService);
  }

  return new InMemoryQuickActionRepository();
}

export function makeSettingsRepository(): SettingsRepository {
  if (shouldUsePrisma()) {
    return new SettingsPrismaRepository(prismaService);
  }

  return new InMemorySettingsRepository();
}

export function makeYandexBalanceRepository(): YandexBalanceRepository {
  if (shouldUsePrisma()) {
    return new YandexBalancePrismaRepository(prismaService);
  }

  return new InMemoryYandexBalanceRepository();
}
