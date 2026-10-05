import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { HealthModule } from "./modules/health/health.module.js";
import { DriversModule } from "./modules/drivers/drivers.module.js";
import { CarsModule } from "./modules/cars/cars.module.js";
import { ContractsModule } from "./modules/contracts/contracts.module.js";
import { LedgerModule } from "./modules/ledger/ledger.module.js";
import { PaymentsModule } from "./modules/payments/payments.module.js";
import { PayoutsModule } from "./modules/payouts/payouts.module.js";
import { DashboardModule } from "./modules/dashboard/dashboard.module.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { AuditModule } from "./modules/audit/audit.module.js";
import { DebtEngineModule } from "./modules/debt-engine/debt-engine.module.js";
import { NotificationsModule } from "./modules/notifications/notifications.module.js";
import { RbacModule } from "./modules/rbac/rbac.module.js";
import { YandexModule } from "./modules/yandex/yandex.module.js";
import { BakaiModule } from "./modules/bakai/bakai.module.js";
import { FinanceWorkflowModule } from "./modules/finance-workflow/finance-workflow.module.js";
import { OutboxModule } from "./modules/outbox/outbox.module.js";
import { ApprovalsModule } from "./modules/approvals/approvals.module.js";
import { WorkersModule } from "./modules/workers/workers.module.js";
import { IntegrationsModule } from "./modules/integrations/integrations.module.js";
import { MobileDriverModule } from "./modules/mobile-driver/mobile-driver.module.js";
import { MobileManagerModule } from "./modules/mobile-manager/mobile-manager.module.js";
import { IncidentsModule } from "./modules/incidents/incidents.module.js";
import { UsersModule } from "./modules/users/users.module.js";
import { ReportsModule } from "./modules/reports/reports.module.js";
import { SettingsModule } from "./modules/settings/settings.module.js";
import { ChatsModule } from "./modules/chats/chats.module.js";
import { PartsModule } from "./modules/parts/parts.module.js";
import { SystemAuditInterceptor } from "./modules/audit/system-audit.interceptor.js";

@Module({
  imports: [
    HealthModule,
    AuthModule,
    AuditModule,
    RbacModule,
    DriversModule,
    CarsModule,
    ContractsModule,
    LedgerModule,
    PaymentsModule,
    PayoutsModule,
    DebtEngineModule,
    NotificationsModule,
    FinanceWorkflowModule,
    OutboxModule,
    ApprovalsModule,
    IntegrationsModule,
    WorkersModule,
    MobileDriverModule,
    MobileManagerModule,
    IncidentsModule,
    UsersModule,
    ReportsModule,
    SettingsModule,
    ChatsModule,
    PartsModule,
    YandexModule,
    BakaiModule,
    DashboardModule,
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: SystemAuditInterceptor,
    },
  ],
})
export class AppModule {}
