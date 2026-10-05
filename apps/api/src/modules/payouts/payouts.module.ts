import { Module } from "@nestjs/common";
import { PayoutsController } from "./payouts.controller.js";
import { PayoutsService } from "./payouts.service.js";
import { FinanceWorkflowModule } from "../finance-workflow/finance-workflow.module.js";

@Module({
  imports: [FinanceWorkflowModule],
  controllers: [PayoutsController],
  providers: [PayoutsService],
})
export class PayoutsModule {}
