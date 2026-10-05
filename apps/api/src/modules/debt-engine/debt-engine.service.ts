import { Injectable } from "@nestjs/common";
import type { DriverDebtSummary } from "@gopark/contracts";
import {
  makeDriverCreditBalanceRepository,
  makeObligationRepository,
} from "../../common/application/repository.factory.js";
import type {
  DriverCreditBalanceRepository,
  ObligationRepository,
} from "../../common/repositories/index.js";
import { DriverStatusRequestPolicyService } from "../mobile-read/driver-status-request-policy.service.js";

@Injectable()
export class DebtEngineService {
  private readonly repository: ObligationRepository = makeObligationRepository();
  private readonly driverCreditBalanceRepository: DriverCreditBalanceRepository = makeDriverCreditBalanceRepository();
  private readonly statusRequestPolicyService = new DriverStatusRequestPolicyService();

  async getDriverDebtSummary(driverId: string): Promise<DriverDebtSummary> {
    const creditBalance = await this.driverCreditBalanceRepository.getByDriver(driverId);
    const policy = await this.statusRequestPolicyService.getEffectiveDebtPolicy(
      driverId,
      new Date().toISOString().slice(0, 10),
      creditBalance,
    );

    return {
      driverId,
      totalDebt: policy.currentDebt,
      creditBalance,
      overdueDebt: policy.overdueDebt,
      nextPaymentAmount: policy.nextPaymentAmount,
      nextPaymentDate: policy.nextPaymentDate,
    };
  }
}
