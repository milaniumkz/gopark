import { Injectable } from "@nestjs/common";
import type { ReportsOverview } from "@gopark/contracts";
import {
  makeDriverRepository,
  makeIncidentRepository,
  makeObligationRepository,
  makeOutboxRepository,
  makePayoutRepository,
} from "../../common/application/repository.factory.js";
import type {
  DriverRepository,
  IncidentRepository,
  ObligationRepository,
  OutboxRepository,
  PayoutRepository,
} from "../../common/repositories/index.js";

@Injectable()
export class ReportsService {
  private readonly driverRepository: DriverRepository = makeDriverRepository();
  private readonly obligationRepository: ObligationRepository = makeObligationRepository();
  private readonly payoutRepository: PayoutRepository = makePayoutRepository();
  private readonly outboxRepository: OutboxRepository = makeOutboxRepository();
  private readonly incidentRepository: IncidentRepository = makeIncidentRepository();

  async getOverview(companyName?: string | null): Promise<ReportsOverview> {
    const [drivers, incidents, payouts, outboxEvents] = await Promise.all([
      companyName ? this.driverRepository.listByCompany(companyName) : this.driverRepository.list(),
      companyName ? this.incidentRepository.listByCompany(companyName) : this.incidentRepository.list(),
      companyName ? this.payoutRepository.listByCompany(companyName) : this.payoutRepository.list(),
      companyName ? this.outboxRepository.listByCompany(companyName) : this.outboxRepository.list(),
    ]);
    const scopedDrivers = drivers;
    const openIncidentsCount = incidents.filter((item) => item.status === "open").length;
    const requestedPayoutsCount = payouts.filter((item) => item.status === "requested").length;
    const pendingOutboxCount = outboxEvents.filter((item) => item.status === "pending").length;

    const [totalDue, totalPaid, overdueDebtTotal] = await Promise.all([
      companyName ? this.obligationRepository.getTotalDueByCompany(companyName) : this.obligationRepository.getTotalDueByDrivers(scopedDrivers.map((item) => item.id)),
      companyName ? this.obligationRepository.getTotalPaidByCompany(companyName) : this.obligationRepository.getTotalPaidByDrivers(scopedDrivers.map((item) => item.id)),
      companyName ? this.obligationRepository.getOverdueAmountByCompany(companyName) : this.obligationRepository.getOverdueAmountByDrivers(scopedDrivers.map((item) => item.id)),
    ]);

    return {
      collectionRatePercent: totalDue === 0 ? 0 : Math.round((totalPaid / totalDue) * 100),
      overdueDebtTotal,
      requestedPayoutsCount,
      openIncidentsCount,
      pendingOutboxCount,
    };
  }
}
