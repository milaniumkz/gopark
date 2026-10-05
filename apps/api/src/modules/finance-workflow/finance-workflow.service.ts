import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import type {
  ContractRepository,
  DriverCreditBalanceRepository,
  LedgerRepository,
  ObligationRepository,
  PaymentRepository,
  PayoutRepository,
  YandexBalanceRepository,
} from "../../common/repositories/index.js";
import type {
  ContractEarlyPayoffResult,
  DriverCreditWriteoffResult,
  PaymentListItem,
  PayoutListItem,
} from "@gopark/contracts";
import type { CreatePaymentDto } from "../payments/dto/create-payment.dto.js";
import type { CreateContractEarlyPayoffDto } from "../payments/dto/create-contract-early-payoff.dto.js";
import type { CreateDriverCreditWriteoffDto } from "../payments/dto/create-driver-credit-writeoff.dto.js";
import type { CreatePayoutDto } from "../payouts/dto/create-payout.dto.js";
import { AuditLogService } from "../audit/audit-log.service.js";
import { NotificationsCreateService } from "../notifications/notifications-create.service.js";
import { OutboxService } from "../outbox/outbox.service.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";
import {
  makeContractRepository,
  makeDriverCreditBalanceRepository,
  makeLedgerRepository,
  makeObligationRepository,
  makePaymentRepository,
  makePayoutRepository,
  makeYandexBalanceRepository,
} from "../../common/application/repository.factory.js";
import type { RequestUser } from "../rbac/request-user.js";

@Injectable()
export class FinanceWorkflowService {
  private readonly contractRepository: ContractRepository = makeContractRepository();
  private readonly paymentRepository: PaymentRepository = makePaymentRepository();
  private readonly payoutRepository: PayoutRepository = makePayoutRepository();
  private readonly obligationRepository: ObligationRepository = makeObligationRepository();
  private readonly driverCreditBalanceRepository: DriverCreditBalanceRepository = makeDriverCreditBalanceRepository();
  private readonly ledgerRepository: LedgerRepository = makeLedgerRepository();
  private readonly yandexBalanceRepository: YandexBalanceRepository = makeYandexBalanceRepository();
  private readonly prismaService = new PrismaService();

  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly notificationsCreateService: NotificationsCreateService,
    private readonly outboxService: OutboxService,
  ) {}

  async registerPayment(input: CreatePaymentDto, currentUser?: RequestUser | null): Promise<PaymentListItem> {
    const outstandingAmount = await this.assertPaymentInputValid(input);
    const appliedAmount = Math.min(input.amount, outstandingAmount);
    const unappliedAmount = Math.max(0, input.amount - appliedAmount);

    const payment = await this.paymentRepository.create({
      ...input,
      appliedAmount,
      unappliedAmount,
    });
    const accountId = await this.resolveLedgerAccountId(input.driverId);

    if (appliedAmount > 0) {
      await this.obligationRepository.applyPayment(
        input.driverId,
        input.contractId,
        appliedAmount,
        input.paymentForDate ?? this.today(),
        input.paymentType,
      );
    }

    if (unappliedAmount > 0) {
      await this.driverCreditBalanceRepository.addCredit(input.driverId, unappliedAmount);

      await this.ledgerRepository.create({
        accountId,
        driverId: input.driverId,
        type: "adjustment",
        amount: String(unappliedAmount),
        externalReference: `${payment.id}:credit`,
      });
    }

    await this.ledgerRepository.create({
      accountId,
      contractId: input.contractId,
      driverId: input.driverId,
      type: "payment",
      amount: String(input.amount),
      externalReference: payment.id,
    });

    await this.auditLogService.write("payment.created", "payment", payment.id, {
      afterData: {
        actor: currentUser ? serializeAuditActor(currentUser) : null,
        payment,
        paymentForDate: input.paymentForDate ?? null,
        paymentType: input.paymentType ?? "installment",
      },
    });
    await this.auditLogService.write("obligation.payment.applied", "driver", input.driverId, {
      afterData: {
        actor: currentUser ? serializeAuditActor(currentUser) : null,
        paymentId: payment.id,
        contractId: input.contractId,
        amount: input.amount,
        appliedAmount,
        unappliedAmount,
      },
    });
    if (unappliedAmount > 0) {
      await this.auditLogService.write("driver.credit.created", "driver", input.driverId, {
        afterData: {
          actor: currentUser ? serializeAuditActor(currentUser) : null,
          paymentId: payment.id,
          amount: unappliedAmount,
        },
      });
    }
    await this.outboxService.create("payment.registered", "payment", payment.id, {
      paymentId: payment.id,
      contractId: input.contractId,
      driverId: input.driverId,
      amount: input.amount,
      appliedAmount,
      unappliedAmount,
      paymentForDate: input.paymentForDate ?? null,
    });
    if (unappliedAmount > 0) {
      await this.outboxService.create("driver.credit.created", "driver", input.driverId, {
        driverId: input.driverId,
        paymentId: payment.id,
        sourceContractId: input.contractId,
        amount: unappliedAmount,
      });
    }

    await this.closeContractWhenFullyPaid(input.driverId, input.contractId, payment);

    return payment;
  }

  async payOffContractEarly(input: CreateContractEarlyPayoffDto, currentUser?: RequestUser | null): Promise<ContractEarlyPayoffResult> {
    const contract = await this.contractRepository.getById(input.contractId);
    if (!contract) {
      throw new BadRequestException(`Contract not found: ${input.contractId}`);
    }

    if (contract.driverId !== input.driverId) {
      throw new BadRequestException(
        `Early payoff driverId does not match contract driverId: ${input.driverId} != ${contract.driverId}`,
      );
    }

    if (contract.status !== "active") {
      throw new BadRequestException(`Early payoff is allowed only for active contracts: ${input.contractId}`);
    }

    const outstandingAmount = await this.getOutstandingAmountByContract(input.driverId, input.contractId);
    if (outstandingAmount <= 0) {
      throw new BadRequestException(`Contract has no outstanding debt to pay off: ${input.contractId}`);
    }

    if (input.amount < outstandingAmount) {
      throw new BadRequestException(
        `Early payoff amount must cover the full remaining contract debt: requested ${input.amount}, required ${outstandingAmount}`,
      );
    }

    const payment = await this.registerPayment(input, currentUser);
    const remainingContractDebt = await this.getOutstandingAmountByContract(input.driverId, input.contractId);
    if (remainingContractDebt > 0) {
      throw new BadRequestException(
        `Early payoff did not fully close the contract debt: remaining ${remainingContractDebt}`,
      );
    }

    const updatedContract = await this.contractRepository.getById(input.contractId);

    return {
      paymentId: payment.id,
      contractId: input.contractId,
      driverId: input.driverId,
      amount: payment.amount,
      appliedAmount: payment.appliedAmount,
      unappliedAmount: payment.unappliedAmount,
      contractStatus: updatedContract?.status ?? "closed",
      remainingContractDebt,
      createdAt: payment.createdAt,
    };
  }

  async autoApplyDriverCreditToContract(input: {
    driverId: string;
    contractId: string;
    reason?: string;
  }): Promise<DriverCreditWriteoffResult | null> {
    const currentCreditBalance = await this.driverCreditBalanceRepository.getByDriver(input.driverId);
    if (currentCreditBalance <= 0) {
      return null;
    }

    const outstandingAmount = await this.getOutstandingAmountByContract(input.driverId, input.contractId);
    const amountToWriteOff = Math.min(currentCreditBalance, outstandingAmount);
    if (amountToWriteOff <= 0) {
      return null;
    }

    await this.obligationRepository.applyPayment(input.driverId, input.contractId, amountToWriteOff);

    const remainingCreditBalance = await this.driverCreditBalanceRepository.addCredit(input.driverId, -amountToWriteOff);
    const accountId = await this.resolveLedgerAccountId(input.driverId);
    const writeoffId = randomUUID();
    const reason = input.reason?.trim() || "Автоматическое списание переплаты";

    await this.ledgerRepository.create({
      accountId,
      contractId: input.contractId,
      driverId: input.driverId,
      type: "refund",
      amount: String(amountToWriteOff),
      externalReference: `credit-auto-writeoff:${writeoffId}`,
    });

    await this.auditLogService.write("obligation.payment.applied", "driver", input.driverId, {
      afterData: {
        actor: null,
        contractId: input.contractId,
        amount: amountToWriteOff,
        source: "auto_credit_writeoff",
      },
    });
    await this.auditLogService.write("driver.credit.written_off", "driver", input.driverId, {
      afterData: {
        actor: null,
        amount: amountToWriteOff,
        reason,
      },
    });
    await this.outboxService.create("driver.credit.written_off", "driver", input.driverId, {
      driverId: input.driverId,
      contractId: input.contractId,
      amount: amountToWriteOff,
      reason,
      remainingCreditBalance,
      writeoffId,
      automatic: true,
    });

    return {
      driverId: input.driverId,
      amountWrittenOff: amountToWriteOff,
      remainingCreditBalance,
      reason,
      createdAt: new Date().toISOString(),
    };
  }

  private async assertPaymentInputValid(input: CreatePaymentDto): Promise<number> {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new BadRequestException("Payment amount must be greater than 0");
    }

    if (input.provider.trim().length === 0) {
      throw new BadRequestException("Payment provider must not be empty");
    }

    const contract = await this.contractRepository.getById(input.contractId);
    if (!contract) {
      throw new BadRequestException(`Contract not found: ${input.contractId}`);
    }

    if (contract.driverId !== input.driverId) {
      throw new BadRequestException(
        `Payment driverId does not match contract driverId: ${input.driverId} != ${contract.driverId}`,
      );
    }

    const obligations = (await this.obligationRepository.listByDriver(input.driverId))
      .filter((item) => item.contractId === input.contractId)
      .filter((item) => !input.paymentType || item.type === input.paymentType);
    const outstandingAmount = obligations.reduce(
      (sum, item) => sum + Math.max(0, item.amount - item.paidAmount),
      0,
    );

    return outstandingAmount;
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private async getOutstandingAmountByContract(driverId: string, contractId: string): Promise<number> {
    const obligations = (await this.obligationRepository.listByDriver(driverId))
      .filter((item) => item.contractId === contractId);

    return obligations.reduce((sum, item) => sum + Math.max(0, item.amount - item.paidAmount), 0);
  }

  private async closeContractWhenFullyPaid(
    driverId: string,
    contractId: string,
    payment: PaymentListItem,
  ): Promise<void> {
    const contract = await this.contractRepository.getById(contractId);
    if (!contract || contract.status !== "active") {
      return;
    }

    const remainingContractDebt = await this.getOutstandingAmountByContract(driverId, contractId);
    if (remainingContractDebt > 0) {
      return;
    }

    await this.contractRepository.updateStatus(contractId, "closed");
    await this.auditLogService.write("contract.paid_off", "contract", contractId);
    await this.outboxService.create("contract.paid_off", "contract", contractId, {
      contractId,
      driverId,
      paymentId: payment.id,
      amount: payment.amount,
      appliedAmount: payment.appliedAmount,
      unappliedAmount: payment.unappliedAmount,
      remainingContractDebt,
    });
  }

  async requestPayout(input: CreatePayoutDto, currentUser?: RequestUser | null): Promise<PayoutListItem> {
    await this.assertPayoutAmountAvailable(input);

    const payout = await this.payoutRepository.create(input);
    const accountId = await this.resolveLedgerAccountId(input.driverId);

    await this.ledgerRepository.create({
      accountId,
      driverId: input.driverId,
      type: "payout",
      amount: String(input.amount),
      externalReference: payout.id,
    });

    await this.auditLogService.write("payout.created", "payout", payout.id, {
      afterData: {
        actor: currentUser ? serializeAuditActor(currentUser) : null,
        payout,
        payoutDestination: input.payoutDestination?.trim() || null,
      },
    });
    await this.notificationsCreateService.createDriverPayoutRequested(input.driverId);
    await this.notificationsCreateService.createManagerPayoutRequested(input.driverId, input.amount);
    await this.outboxService.create("payout.requested", "payout", payout.id, {
      payoutId: payout.id,
      driverId: input.driverId,
      amount: input.amount,
      payoutDestination: input.payoutDestination?.trim() || null,
    });

    return payout;
  }

  async writeOffDriverCredit(input: CreateDriverCreditWriteoffDto, currentUser?: RequestUser | null): Promise<DriverCreditWriteoffResult> {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new BadRequestException("Credit writeoff amount must be greater than 0");
    }

    const currentCreditBalance = await this.driverCreditBalanceRepository.getByDriver(input.driverId);
    if (input.amount > currentCreditBalance) {
      throw new BadRequestException(
        `Credit writeoff amount exceeds current credit balance: requested ${input.amount}, available ${currentCreditBalance}`,
      );
    }

    const remainingCreditBalance = await this.driverCreditBalanceRepository.addCredit(input.driverId, -input.amount);
    const accountId = await this.resolveLedgerAccountId(input.driverId);
    const writeoffId = randomUUID();

    await this.ledgerRepository.create({
      accountId,
      driverId: input.driverId,
      type: "refund",
      amount: String(input.amount),
      externalReference: `credit-writeoff:${writeoffId}`,
    });

    await this.auditLogService.write("driver.credit.written_off", "driver", input.driverId, {
      afterData: {
        actor: currentUser ? serializeAuditActor(currentUser) : null,
        amount: input.amount,
        reason: input.reason ?? null,
      },
    });
    await this.outboxService.create("driver.credit.written_off", "driver", input.driverId, {
      driverId: input.driverId,
      amount: input.amount,
      reason: input.reason?.trim() || null,
      remainingCreditBalance,
      writeoffId,
    });

    return {
      driverId: input.driverId,
      amountWrittenOff: input.amount,
      remainingCreditBalance,
      reason: input.reason?.trim() || null,
      createdAt: new Date().toISOString(),
    };
  }

  private async assertPayoutAmountAvailable(input: CreatePayoutDto): Promise<void> {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new BadRequestException("Payout amount must be greater than 0");
    }

    const [balance, reservedAmount] = await Promise.all([
      this.yandexBalanceRepository.getLatestByDriver(input.driverId),
      this.payoutRepository.getRequestedAmountByDriver(input.driverId),
    ]);

    const availableToWithdraw = Math.max(0, (balance?.amount ?? 0) - reservedAmount);
    const maxPayoutAmount = Math.max(0, availableToWithdraw - 100);

    if (input.amount > availableToWithdraw) {
      throw new BadRequestException(
        `Payout amount exceeds available balance: requested ${input.amount}, available ${availableToWithdraw}`,
      );
    }

    if (input.amount > maxPayoutAmount) {
      throw new BadRequestException(
        `Payout amount must leave at least 100 som on the balance: requested ${input.amount}, allowed ${maxPayoutAmount}`,
      );
    }
  }

  private async resolveLedgerAccountId(driverId: string): Promise<string> {
    const prisma = this.prismaService.client;
    if (!prisma) {
      return `acct_${driverId}`;
    }

    const account = await prisma.ledgerAccount.upsert({
      where: { code: `acct_${driverId}` },
      update: {
        name: `Driver settlement ${driverId}`,
        currency: "KGS",
      },
      create: {
        code: `acct_${driverId}`,
        name: `Driver settlement ${driverId}`,
        currency: "KGS",
      },
      select: { id: true },
    });

    return account.id;
  }
}

function serializeAuditActor(currentUser: RequestUser): Record<string, unknown> {
  return {
    id: currentUser.id,
    role: currentUser.role,
    companyName: currentUser.companyName ?? null,
    managerLevel: currentUser.managerLevel ?? null,
    customRoleKey: currentUser.customRoleKey ?? null,
  };
}
