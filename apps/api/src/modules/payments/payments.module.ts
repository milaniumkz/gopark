import { Module } from "@nestjs/common";
import { PaymentsController } from "./payments.controller.js";
import { PaymentsService } from "./payments.service.js";
import { FinanceWorkflowModule } from "../finance-workflow/finance-workflow.module.js";

@Module({
  imports: [FinanceWorkflowModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
