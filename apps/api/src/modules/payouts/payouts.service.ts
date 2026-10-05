import { Injectable } from "@nestjs/common";
import type { PayoutListItem } from "@gopark/contracts";
import { makePayoutRepository } from "../../common/application/repository.factory.js";
import type { PayoutRepository } from "../../common/repositories/index.js";
import type { CreatePayoutDto } from "./dto/create-payout.dto.js";
import { FinanceWorkflowService } from "../finance-workflow/finance-workflow.service.js";
import type { RequestUser } from "../rbac/request-user.js";

@Injectable()
export class PayoutsService {
  private readonly repository: PayoutRepository = makePayoutRepository();

  constructor(private readonly financeWorkflowService: FinanceWorkflowService) {}

  async list(): Promise<PayoutListItem[]> {
    return this.repository.list();
  }

  async listByCompany(companyName: string): Promise<PayoutListItem[]> {
    return this.repository.listByCompany(companyName);
  }

  async create(input: CreatePayoutDto, currentUser?: RequestUser | null): Promise<PayoutListItem> {
    return this.financeWorkflowService.requestPayout(input, currentUser);
  }
}
