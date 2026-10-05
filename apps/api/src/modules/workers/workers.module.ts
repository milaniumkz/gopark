import { Module } from "@nestjs/common";
import { WorkersController } from "./workers.controller.js";
import { OutboxWorkerService } from "./outbox-worker.service.js";
import { OutboxModule } from "../outbox/outbox.module.js";
import { IntegrationsModule } from "../integrations/integrations.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { OutboxEventProcessorService } from "./outbox-event-processor.service.js";
import { OutboxQueueRuntimeService } from "./outbox-queue-runtime.service.js";

@Module({
  imports: [OutboxModule, IntegrationsModule, AuditModule],
  controllers: [WorkersController],
  providers: [
    OutboxEventProcessorService,
    OutboxWorkerService,
    OutboxQueueRuntimeService,
  ],
  exports: [OutboxQueueRuntimeService],
})
export class WorkersModule {}
