import { Module } from "@nestjs/common";
import { OutboxController } from "./outbox.controller.js";
import { OutboxService } from "./outbox.service.js";
import { OutboxDispatchService } from "../workers/outbox-dispatch.service.js";

@Module({
  controllers: [OutboxController],
  providers: [OutboxService, OutboxDispatchService],
  exports: [OutboxService, OutboxDispatchService],
})
export class OutboxModule {}
