import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  ManagerAssignedDriverItem,
  ManagerAlertItem,
  ManagerDashboardSummary,
  ManagerDriverDetail,
  ManagerDriverPaymentItem,
  ManagerExecuteActionResult,
  ManagerIncidentItem,
  ManagerIdleVehicleItem,
  ManagerIdleVehicleCategory,
  ManagerQuickActionItem,
  ManagerRiskStatusReviewItem,
  ManagerStatusRequestItem,
  ManagerTeamItem,
  VehicleDetail,
  VehicleListItem,
} from "@gopark/contracts";
import {
  makeCarRepository,
  makeContractRepository,
  makeDriverRepository,
  makeIncidentRepository,
  makeManagerAlertRepository,
  makeObligationRepository,
  makePaymentRepository,
  makeQuickActionRepository,
  makeStatusRequestRepository,
  makeUserRepository,
} from "../../common/application/repository.factory.js";
import type {
  CarRepository,
  ContractRepository,
  DriverRepository,
  IncidentRepository,
  ManagerAlertRepository,
  ObligationRepository,
  PaymentRepository,
  QuickActionRepository,
  StatusRequestRepository,
  UserRepository,
} from "../../common/repositories/index.js";
import { MobileAccessService } from "../mobile-read/mobile-access.service.js";
import { DriverMobileReadService } from "../mobile-read/driver-mobile-read.service.js";
import { DriverStatusRequestPolicyService } from "../mobile-read/driver-status-request-policy.service.js";
import { NotificationsCreateService } from "../notifications/notifications-create.service.js";
import type { RequestUser } from "../rbac/request-user.js";
import { matchesCompanyScope } from "../rbac/company-scope.js";
import { PrismaService } from "../../infrastructure/prisma/prisma.service.js";

@Injectable()
export class MobileManagerService {
  private readonly driverRepository: DriverRepository = makeDriverRepository();
  private readonly carRepository: CarRepository = makeCarRepository();
  private readonly contractRepository: ContractRepository = makeContractRepository();
  private readonly incidentRepository: IncidentRepository = makeIncidentRepository();
  private readonly managerAlertRepository: ManagerAlertRepository = makeManagerAlertRepository();
  private readonly obligationRepository: ObligationRepository = makeObligationRepository();
  private readonly paymentRepository: PaymentRepository = makePaymentRepository();
  private readonly quickActionRepository: QuickActionRepository = makeQuickActionRepository();
  private readonly statusRequestRepository: StatusRequestRepository = makeStatusRequestRepository();
  private readonly userRepository: UserRepository = makeUserRepository();
  private readonly statusRequestPolicyService = new DriverStatusRequestPolicyService();
  private readonly prismaService = new PrismaService();

  constructor(
    private readonly driverMobileReadService: DriverMobileReadService,
    private readonly mobileAccessService: MobileAccessService,
    private readonly notificationsCreateService: NotificationsCreateService,
  ) {}

  async getSummary(currentUser: RequestUser | null): Promise<ManagerDashboardSummary> {
    const scopedDrivers = await this.mobileAccessService.getScopedDrivers(currentUser);
    const [cars, alerts] = await Promise.all([
      this.getVehicles(currentUser),
      this.getScopedAlerts(currentUser),
    ]);
    const summarySnapshot = await this.driverMobileReadService.getManagerDriversSummary(
      scopedDrivers.map((driver) => driver.id),
      this.today(),
    );

    return {
      assignedDrivers: scopedDrivers.length,
      overdueDrivers: summarySnapshot.overdueDrivers,
      paymentDueDrivers: summarySnapshot.paymentDueDrivers,
      activeCars: cars.filter((item) => (
        typeof item.assignedDriverId === "string"
        && (item.status === "assigned" || item.status === "active_installment")
      )).length,
      incidentsOpen: summarySnapshot.openIncidents,
      dueTodayAmount: summarySnapshot.dueTodayAmount,
      pendingStatusRequests: summarySnapshot.pendingStatusRequests,
      criticalAlerts: alerts.length,
    };
  }

  async getDrivers(
    currentUser: RequestUser | null,
    dueDateFrom?: string | null,
    dueDateTo?: string | null,
  ): Promise<ManagerAssignedDriverItem[]> {
    const drivers = await this.mobileAccessService.getScopedDrivers(currentUser);
    const duePeriod = this.getDatePeriod(dueDateFrom, dueDateTo);
    const [assignmentSnapshots, financeSnapshots, users] = await Promise.all([
      this.driverMobileReadService.getDriverAssignmentSnapshots(
        drivers.map((driver) => ({
          driverId: driver.id,
          activeContractId: driver.activeContractId,
        })),
      ),
      this.driverMobileReadService.getFinanceSnapshots(drivers.map((driver) => driver.id)),
      currentUser?.companyName ? this.userRepository.listAdminByCompany(currentUser.companyName) : this.userRepository.listAdmin(),
    ]);
    const historicalSnapshots = await this.getHistoricalFinanceSnapshots(drivers, currentUser);
    const effectiveStatuses = await this.statusRequestPolicyService.getEffectiveCurrentStatuses(drivers, this.today());
    const duePeriodAmounts = new Map<string, number>();
    const overduePeriodAmounts = new Map<string, number>();
    if (duePeriod) {
      await Promise.all(drivers.map(async (driver) => {
        const obligations = await this.statusRequestPolicyService.listEffectiveOpenObligations(
          driver.id, financeSnapshots[driver.id]?.creditBalance ?? 0,
        );
        const inPeriod = obligations.filter((item) => item.effectiveDueDate >= duePeriod.startDate && item.effectiveDueDate <= duePeriod.endDate);
        duePeriodAmounts.set(driver.id, inPeriod.reduce((sum, item) => sum + item.remainingAmount, 0));
        overduePeriodAmounts.set(driver.id, inPeriod.filter((item) => item.effectiveDueDate < this.today()).reduce((sum, item) => sum + item.remainingAmount, 0));
      }));
    }
    const managerNameById = new Map<string, string>();
    for (const user of users) {
      if (user.role !== "manager") {
        continue;
      }
      managerNameById.set(user.id, user.displayName);
      if (user.managerProfileId) {
        managerNameById.set(user.managerProfileId, user.displayName);
      }
    }

    return drivers.map((driver) => {
      const financeSnapshot = financeSnapshots[driver.id];
      const historicalSnapshot = !driver.activeContractId ? historicalSnapshots.get(driver.id) : null;
      const effectiveFinance = historicalSnapshot
        ? this.mergeHistoricalFinance(historicalSnapshot.finance, financeSnapshot)
        : financeSnapshot;
      const assignment = assignmentSnapshots[driver.id];
      const effectiveStatus = effectiveStatuses[driver.id] ?? driver.status;
      const isTerminatedDriver = effectiveStatus === "terminated";
      const effectiveVehicle = isTerminatedDriver
        ? "unassigned"
        : assignment?.vehicle ?? historicalSnapshot?.vehicle ?? "unassigned";
      const effectiveContractId = driver.activeContractId ?? historicalSnapshot?.contractId ?? null;

      return {
        id: driver.id,
        fullName: driver.fullName,
        phone: driver.phone,
        status: effectiveStatus,
        riskStatus: driver.riskStatus ?? "normal",
        weeklyDayOff: driver.weeklyDayOff ?? null,
        vehicle: effectiveVehicle,
        vehicleStatus: isTerminatedDriver ? null : assignment?.vehicleStatus ?? null,
        debt: effectiveFinance?.currentDebt ?? 0,
        creditBalance: effectiveFinance?.creditBalance ?? 0,
        overdueDebt: effectiveFinance?.overdueDebt ?? 0,
        overdueSinceDate: effectiveFinance?.overdueSinceDate ?? null,
        overdueUntilDate: effectiveFinance?.overdueUntilDate ?? null,
        duePeriodAmount: duePeriodAmounts.get(driver.id) ?? 0,
        overduePeriodAmount: duePeriod ? overduePeriodAmounts.get(driver.id) ?? 0 : null,
        yandexBalance: effectiveFinance?.yandexBalance ?? 0,
        nextPaymentAmount: effectiveFinance?.nextPaymentAmount ?? 0,
        nextPaymentDate: effectiveFinance?.nextPaymentDate ?? null,
        lastPaymentDate: effectiveFinance?.lastPaymentDate ?? null,
        managerId: driver.managerId,
        managerName: driver.managerId ? managerNameById.get(driver.managerId) ?? null : null,
        contractId: effectiveContractId,
        photoUrl: driver.photoUrl ?? null,
        photoStatus: driver.photoStatus ?? "missing",
      };
    });
  }

  private getDatePeriod(
    startDate?: string | null,
    endDate?: string | null,
  ): { startDate: string; endDate: string } | null {
    if (!startDate && !endDate) return null;
    const from = startDate || endDate;
    const to = endDate || startDate;
    if (!this.isDateOnly(from) || !this.isDateOnly(to) || from > to) {
      throw new BadRequestException("Укажите корректный период: начало не позже окончания");
    }
    return { startDate: from, endDate: to };
  }

  private isDateOnly(value?: string | null): value is string {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  }

  async getIdleVehicles(currentUser: RequestUser | null): Promise<ManagerIdleVehicleItem[]> {
    const [cars, drivers, users, incidents] = await Promise.all([
      this.getVehicles(currentUser),
      this.mobileAccessService.getScopedDrivers(currentUser),
      currentUser?.companyName ? this.userRepository.listAdminByCompany(currentUser.companyName) : this.userRepository.listAdmin(),
      currentUser?.companyName ? this.incidentRepository.listByCompany(currentUser.companyName) : this.incidentRepository.list(),
    ]);
    const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
    const managerNameById = this.getManagerNameMap(users);
    const openIncidentByCarId = new Map(
      incidents
        .filter((item) => item.carId && !["resolved", "closed", "archived"].includes(item.status))
        .map((item) => [item.carId as string, item]),
    );
    const openIncidentByDriverId = new Map(
      incidents
        .filter((item) => item.driverId && !["resolved", "closed", "archived"].includes(item.status))
        .map((item) => [item.driverId as string, item]),
    );

    const idleVehicles: ManagerIdleVehicleItem[] = [];
    for (const car of cars) {
      const ownerDriverId = car.assignedDriverId ?? car.lastAssignedDriverId ?? null;
      const driver = ownerDriverId ? driverById.get(ownerDriverId) : null;
      const incident = openIncidentByCarId.get(car.id) ?? (ownerDriverId ? openIncidentByDriverId.get(ownerDriverId) : undefined);
      const category = this.resolveIdleVehicleCategory(car.status, incident);
      const isIdle = !car.assignedDriverId || !["assigned", "active_installment"].includes(car.status) || Boolean(incident) || category !== "office";
      if (!isIdle) {
        continue;
      }
      idleVehicles.push({
        id: car.id,
        plateNumber: car.plateNumber,
        label: [car.make, car.model].filter(Boolean).join(" ").trim() || car.vin,
        status: car.status,
        category,
        categoryLabel: this.getIdleVehicleCategoryLabel(category),
        reason: incident?.title ?? this.getIdleVehicleCategoryLabel(category),
        driverId: driver?.id ?? ownerDriverId,
        driverName: driver?.fullName ?? null,
        managerId: car.managerId ?? driver?.managerId ?? null,
        managerName: car.managerName ?? (driver?.managerId ? managerNameById.get(driver.managerId) ?? null : null),
        incidentId: incident?.id ?? null,
        sinceDate: incident?.occurredAt ?? null,
      });
    }

    return idleVehicles.sort((left, right) => left.categoryLabel.localeCompare(right.categoryLabel, "ru") || left.plateNumber.localeCompare(right.plateNumber, "ru"));
  }

  async getVehicles(currentUser: RequestUser | null): Promise<VehicleListItem[]> {
    const [cars, drivers, users] = await Promise.all([
      this.getCompanyScopedCars(currentUser),
      this.mobileAccessService.getScopedDrivers(currentUser),
      currentUser?.companyName ? this.userRepository.listAdminByCompany(currentUser.companyName) : this.userRepository.listAdmin(),
    ]);
    const scopedDriverIds = new Set(drivers.map((driver) => driver.id));
    const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
    const managerNameById = this.getManagerNameMap(users);
    const managerIds = currentUser?.role === "manager"
      ? await this.userRepository.getManagerScopeIds(currentUser.id, currentUser.companyName ?? null)
      : new Set<string>();
    const visibleCars = this.canSeeAllCompanyVehicles(currentUser)
      ? cars
      : cars.filter((car) => {
        if (car.managerId) {
          return managerIds.has(car.managerId);
        }
        const ownerDriverId = car.assignedDriverId ?? car.lastAssignedDriverId ?? null;
        return ownerDriverId ? scopedDriverIds.has(ownerDriverId) : false;
      });

    return visibleCars.map((car) => {
      const ownerDriverId = car.assignedDriverId ?? car.lastAssignedDriverId ?? null;
      const driver = ownerDriverId ? driverById.get(ownerDriverId) : null;
      return {
        ...car,
        managerId: car.managerId ?? driver?.managerId ?? null,
        managerName: car.managerName ?? (car.managerId ? managerNameById.get(car.managerId) ?? null : driver?.managerId ? managerNameById.get(driver.managerId) ?? null : null),
      };
    });
  }

  async getVehicleDetail(vehicleId: string, currentUser: RequestUser | null): Promise<VehicleDetail | null> {
    const car = await this.carRepository.getById(vehicleId);
    if (!car || !matchesCompanyScope(currentUser, car.companyName)) {
      return null;
    }
    if (this.canSeeAllCompanyVehicles(currentUser)) {
      return car;
    }

    const visibleCars = await this.getVehicles(currentUser);
    return visibleCars.some((item) => item.id === vehicleId) ? car : null;
  }

  async getManagers(currentUser: RequestUser | null): Promise<ManagerTeamItem[]> {
    const [drivers, users, idleVehicles, vehicles] = await Promise.all([
      this.mobileAccessService.getScopedDrivers(currentUser),
      currentUser?.companyName ? this.userRepository.listAdminByCompany(currentUser.companyName) : this.userRepository.listAdmin(),
      this.getIdleVehicles(currentUser),
      this.getVehicles(currentUser),
    ]);
    const scopedManagerIds = currentUser?.role === "manager"
      ? await this.userRepository.getManagerScopeIds(currentUser.id, currentUser.companyName ?? null)
      : new Set(users.flatMap((user) => [user.id, user.managerProfileId].filter(Boolean) as string[]));
    const financeSnapshots = await this.driverMobileReadService.getFinanceSnapshots(drivers.map((driver) => driver.id));
    const rows = users
      .filter((user) => user.role === "manager" && user.managerProfileId && scopedManagerIds.has(user.managerProfileId))
      .map((manager) => {
        const managerDrivers = drivers.filter((driver) => driver.managerId === manager.managerProfileId);
        const managerIdleVehicles = idleVehicles.filter((vehicle) => vehicle.managerId === manager.managerProfileId);
        return {
          id: manager.id,
          managerProfileId: manager.managerProfileId as string,
          displayName: manager.displayName,
          phone: manager.login,
          managerLevel: manager.managerLevel ?? null,
          driversTotal: managerDrivers.length,
          problemDrivers: managerDrivers.filter((driver) => (
            driver.riskStatus === "risk"
            || ["accident", "maintenance", "idle", "force_majeure"].includes(driver.status)
            || (financeSnapshots[driver.id]?.overdueDebt ?? 0) > 0
          )).length,
          carsTotal: vehicles.filter((car) => car.managerId === manager.managerProfileId || car.managerId === manager.id).length,
          idleCarsTotal: managerIdleVehicles.length,
          idleOfficeCars: managerIdleVehicles.filter((vehicle) => vehicle.category === "office").length,
          idleAccidentCars: managerIdleVehicles.filter((vehicle) => vehicle.category === "accident").length,
          idleInsuranceGpsCars: managerIdleVehicles.filter((vehicle) => vehicle.category === "insurance_gps").length,
          idleServiceCars: managerIdleVehicles.filter((vehicle) => vehicle.category === "service").length,
          idleImpoundCars: managerIdleVehicles.filter((vehicle) => vehicle.category === "impound").length,
          debtTotal: managerDrivers.reduce((sum, driver) => sum + (financeSnapshots[driver.id]?.currentDebt ?? 0), 0),
        };
      });

    return rows.sort((left, right) => left.displayName.localeCompare(right.displayName, "ru"));
  }

  async getDriverDetail(driverId: string, currentUser: RequestUser | null): Promise<ManagerDriverDetail | null> {
    await this.mobileAccessService.assertCanAccessDriver(driverId, currentUser);
    const driver = await this.driverRepository.getById(driverId);
    if (!driver) {
      return null;
    }

    const detail = await this.driverMobileReadService.getManagerDriverDetailSnapshot(driverId, driver.activeContractId);
    const historicalSnapshot = !driver.activeContractId
      ? (await this.getHistoricalFinanceSnapshots([driver], currentUser)).get(driver.id) ?? null
      : null;
    const effectiveFinance = historicalSnapshot
      ? this.mergeHistoricalFinance(historicalSnapshot.finance, detail.finance)
      : detail.finance;
    const effectiveVehicle = detail.assignment.vehicle ?? historicalSnapshot?.vehicle ?? null;
    const effectiveContractNumber = detail.assignment.contractNumber ?? historicalSnapshot?.contractNumber ?? null;
    const currentStatus = await this.statusRequestPolicyService.getEffectiveCurrentStatus(
      driver.id,
      driver.status,
      this.today(),
    );
    const incidents = await this.getDriverIncidentHistory(driver.id, currentUser);

    return {
      id: driver.id,
      fullName: driver.fullName,
      phone: driver.phone,
      status: currentStatus,
      riskStatus: driver.riskStatus ?? "normal",
      weeklyDayOff: driver.weeklyDayOff ?? null,
      vehicle: effectiveVehicle,
      contractNumber: effectiveContractNumber,
      managerId: driver.managerId,
      debt: effectiveFinance.currentDebt,
      creditBalance: effectiveFinance.creditBalance,
      overdueDebt: effectiveFinance.overdueDebt,
      overdueSinceDate: effectiveFinance.overdueSinceDate,
      overdueUntilDate: effectiveFinance.overdueUntilDate,
      yandexBalance: effectiveFinance.yandexBalance,
      nextPaymentAmount: effectiveFinance.nextPaymentAmount,
      nextPaymentDate: effectiveFinance.nextPaymentDate,
      lastPaymentDate: effectiveFinance.lastPaymentDate,
      pendingStatusRequestsCount: detail.pendingStatusRequestsCount,
      recentStatusRequests: detail.recentStatusRequests.map((item) => ({
        id: item.id,
        type: item.type,
        status: item.status,
        period: item.period,
        note: item.note ?? null,
      })),
      openIncidents: incidents.map((item) => ({
          id: item.id,
          title: item.title,
          incidentType: item.incidentType,
          priority: item.priority,
          status: item.status,
          occurredAt: item.occurredAt ?? null,
          statusHistory: item.statusHistory ?? [],
          serviceStage: item.serviceStage ?? null,
          serviceCaseType: item.serviceCaseType ?? null,
          repairNote: item.repairNote ?? null,
          accidentPhotoUrl: item.accidentPhotoUrl ?? null,
        })),
      photoUrl: driver.photoUrl ?? null,
      photoStatus: driver.photoStatus ?? "missing",
      photoUploadedAt: driver.photoUploadedAt ?? null,
      photoReviewedAt: driver.photoReviewedAt ?? null,
      photoReviewNote: driver.photoReviewNote ?? null,
    };
  }

  async reviewDriverPhoto(
    driverId: string,
    body: { action?: string; note?: string },
    currentUser: RequestUser | null,
  ): Promise<ManagerDriverDetail | null> {
    await this.mobileAccessService.assertCanAccessDriver(driverId, currentUser);
    const rawAction = body.action?.trim();
    const action = rawAction === "writeoff" || rawAction === "unrecoverable" || rawAction === "not_recoverable"
      ? "written_off"
      : rawAction;
    if (action !== "approve" && action !== "reject") {
      throw new BadRequestException("Unsupported photo review action");
    }

    const prisma = this.prismaService.client;
    if (prisma) {
      await prisma.driver.update({
        where: { id: driverId },
        data: {
          photoStatus: action === "approve" ? "approved" : "rejected",
          photoReviewedAt: new Date(),
          photoReviewedByUserId: currentUser?.id ?? null,
          photoReviewNote: action === "reject" ? body.note?.trim() || "Фото отклонено" : null,
        },
      });
    }

    return this.getDriverDetail(driverId, currentUser);
  }

  async terminateDriverContract(driverId: string, currentUser: RequestUser | null): Promise<ManagerDriverDetail | null> {
    await this.mobileAccessService.assertCanAccessDriver(driverId, currentUser);
    const contract = await this.contractRepository.getActiveByDriver(driverId);
    if (!contract) {
      throw new BadRequestException("Active contract not found");
    }

    await this.contractRepository.update(contract.id, { status: "terminated" });
    await this.notificationsCreateService.createManagerDriverEvent(
      driverId,
      `Договор расторгнут: ${contract.contractNumber}`,
      "Договор расторгнут бригадиром, автомобиль переведен в офис",
    );

    return this.getDriverDetail(driverId, currentUser);
  }

  async getDriverPayments(driverId: string, currentUser: RequestUser | null): Promise<ManagerDriverPaymentItem[]> {
    await this.mobileAccessService.assertCanAccessDriver(driverId, currentUser);
    const payments = await this.paymentRepository.listByDriver(driverId);

    return payments
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 8)
      .map((item) => ({
        id: item.id,
        contractId: item.contractId,
        amount: item.amount,
        appliedAmount: item.appliedAmount,
        unappliedAmount: item.unappliedAmount,
        status: item.status,
        provider: item.provider,
        paymentForDate: item.paymentForDate ?? null,
        createdAt: item.createdAt,
      }));
  }

  async updateDriverRiskStatus(
    driverId: string,
    body: { riskStatus?: string; note?: string },
    currentUser: RequestUser | null,
  ): Promise<ManagerAssignedDriverItem | null> {
    await this.mobileAccessService.assertCanAccessDriver(driverId, currentUser);
    const riskStatus = body.riskStatus?.trim();
    if (!riskStatus || !["normal", "medium", "risk"].includes(riskStatus)) {
      throw new BadRequestException("Unsupported driver risk status");
    }

    const managerProfile = currentUser?.role === "manager"
      ? await this.userRepository.getManagerProfile(currentUser.id, currentUser.companyName ?? null)
      : null;
    const canApplyImmediately = currentUser?.role !== "manager" || managerProfile?.managerLevel === "senior";

    const updated = canApplyImmediately
      ? await this.driverRepository.updateRiskStatus(driverId, riskStatus, currentUser?.id ?? null, body.note ?? null)
      : await this.driverRepository.getById(driverId);
    if (!updated) {
      throw new NotFoundException("Driver not found");
    }

    if (!canApplyImmediately) {
      if (!managerProfile?.managerProfileId) {
        throw new ForbiddenException("Manager profile is required");
      }
      await this.driverRepository.createRiskStatusReview(
        driverId,
        managerProfile.managerProfileId,
        riskStatus,
        body.note ?? null,
      );
      const seniorManagerIds = new Set(
        (currentUser?.companyName
          ? await this.userRepository.listAdminByCompany(currentUser.companyName)
          : await this.userRepository.listAdmin()
        )
          .filter((user) => user.role === "manager" && user.managerLevel === "senior" && user.managerProfileId)
          .map((user) => user.managerProfileId as string),
      );
      if (managerProfile.seniorManagerProfileId) {
        seniorManagerIds.add(managerProfile.seniorManagerProfileId);
      }

      for (const seniorManagerId of seniorManagerIds) {
        await this.notificationsCreateService.createSeniorRiskStatusReviewRequested(
          driverId,
          seniorManagerId,
          riskStatus,
          managerProfile.displayName || "бригадир",
        );
      }
    }

    const [assignmentSnapshots, financeSnapshots] = await Promise.all([
      this.driverMobileReadService.getDriverAssignmentSnapshots([
        {
          driverId: updated.id,
          activeContractId: updated.activeContractId,
        },
      ]),
      this.driverMobileReadService.getFinanceSnapshots([updated.id]),
    ]);
    const effectiveStatus = await this.statusRequestPolicyService.getEffectiveCurrentStatus(
      updated.id,
      updated.status,
      this.today(),
    );
    const assignment = assignmentSnapshots[updated.id];
    const financeSnapshot = financeSnapshots[updated.id];

    return {
      id: updated.id,
      fullName: updated.fullName,
      phone: updated.phone,
      status: effectiveStatus,
      riskStatus: updated.riskStatus ?? "normal",
      weeklyDayOff: updated.weeklyDayOff ?? null,
      vehicle: assignment?.vehicle ?? "unassigned",
      vehicleStatus: assignment?.vehicleStatus ?? null,
      debt: financeSnapshot?.currentDebt ?? 0,
      creditBalance: financeSnapshot?.creditBalance ?? 0,
      overdueDebt: financeSnapshot?.overdueDebt ?? 0,
      overdueSinceDate: financeSnapshot?.overdueSinceDate ?? null,
      overdueUntilDate: financeSnapshot?.overdueUntilDate ?? null,
      yandexBalance: financeSnapshot?.yandexBalance ?? 0,
      nextPaymentAmount: financeSnapshot?.nextPaymentAmount ?? 0,
      nextPaymentDate: financeSnapshot?.nextPaymentDate ?? null,
      lastPaymentDate: financeSnapshot?.lastPaymentDate ?? null,
      managerId: updated.managerId,
      managerName: null,
      contractId: updated.activeContractId,
    };
  }

  async getRiskStatusRequests(currentUser: RequestUser | null): Promise<ManagerRiskStatusReviewItem[]> {
    if (!currentUser) {
      throw new ForbiddenException("Current user is required");
    }

    if (currentUser.role !== "manager") {
      return this.driverRepository.listRiskStatusReviews([]);
    }

    const profile = await this.userRepository.getManagerProfile(currentUser.id, currentUser.companyName ?? null);
    const scopedManagerIds = await this.userRepository.getManagerScopeIds(currentUser.id, currentUser.companyName ?? null);
    const reviews = await this.driverRepository.listRiskStatusReviews([...scopedManagerIds]);
    if (profile?.managerLevel !== "senior") {
      return reviews.filter((item) => item.requestedByManagerId === profile?.managerProfileId);
    }

    return reviews;
  }

  async reviewRiskStatusRequest(
    requestId: string,
    action: "approve" | "reject",
    currentUser: RequestUser | null,
  ): Promise<ManagerRiskStatusReviewItem | null> {
    if (!currentUser) {
      throw new ForbiddenException("Current user is required");
    }

    const profile = currentUser.role === "manager"
      ? await this.userRepository.getManagerProfile(currentUser.id, currentUser.companyName ?? null)
      : null;
    if (currentUser.role === "manager" && profile?.managerLevel !== "senior") {
      throw new ForbiddenException("Only senior managers can review risk status requests");
    }

    if (currentUser.role === "manager") {
      const scopedManagerIds = await this.userRepository.getManagerScopeIds(currentUser.id, currentUser.companyName ?? null);
      const visibleReviews = await this.driverRepository.listRiskStatusReviews([...scopedManagerIds], 500);
      if (!visibleReviews.some((item) => item.id === requestId)) {
        throw new ForbiddenException("This risk status request is outside manager scope");
      }
    }

    const reviewerManagerId = profile?.managerProfileId ?? currentUser.id;
    return this.driverRepository.reviewRiskStatusRequest(requestId, reviewerManagerId, action);
  }

  async createDriverIncidentAction(
    driverId: string,
    body: { action?: string; note?: string; accidentPhotoUrl?: string },
    currentUser: RequestUser | null,
  ): Promise<ManagerIncidentItem> {
    await this.mobileAccessService.assertCanAccessDriver(driverId, currentUser);
    const driver = await this.driverRepository.getById(driverId);
    if (!driver) {
      throw new NotFoundException("Driver not found");
    }

    const note = this.trimOrNull(body.note);
    const action = body.action?.trim();
    const accidentPhotoUrl = this.trimOrNull(body.accidentPhotoUrl);
    const occurredAt = new Date().toISOString();
    if (action === "inspection") {
      const incident = await this.incidentRepository.create({
        title: `Осмотр: ${driver.fullName}`,
        incidentType: "inspection",
        status: "open",
        priority: "low",
        driverId,
        occurredAt,
        description: note ?? "Осмотр создан бригадиром",
        managerLabel: currentUser?.id ?? null,
        serviceStage: "inspection",
        serviceCaseType: "inspection",
      });
      await this.notificationsCreateService.createManagerDriverEvent(
        driverId,
        `Осмотр: ${driver.fullName}`,
        note ?? "Осмотр создан бригадиром",
      );
      return incident;
    }

    if (action === "repair") {
      const car = await this.carRepository.getAssignedByDriver(driverId);
      if (!car) {
        throw new BadRequestException("У водителя нет назначенной машины для отправки на СТО");
      }
      const manager = currentUser?.role === "manager"
        ? await this.userRepository.getManagerProfile(currentUser.id, currentUser.companyName ?? null)
        : null;
      const incident = await this.incidentRepository.create({
        title: `Ремонт: ${driver.fullName}`,
        incidentType: "repair",
        status: "open",
        priority: "high",
        driverId,
        carId: car.id,
        occurredAt,
        description: note ?? "Автомобиль поставлен на ремонт бригадиром",
        repairNote: note,
        managerLabel: manager?.displayName ?? currentUser?.id ?? null,
        serviceStage: "in_repair",
        serviceCaseType: "non_insurance",
        servicePaymentStatus: "unpaid",
        servicePayer: "driver",
      });
      await this.notificationsCreateService.createManagerDriverEvent(
        driverId,
        `Срочно: ремонт - ${driver.fullName}`,
        note ?? "Водитель отправлен на СТО/ремонт",
      );
      return incident;
    }

    if (action === "accident") {
      if (!accidentPhotoUrl?.startsWith("data:image/") || accidentPhotoUrl.length > 3_200_000) {
        throw new BadRequestException("Accident photo is required and must be an image up to 3 MB");
      }
      await this.driverRepository.update(driverId, { status: "accident" });
      await this.updateAssignedCarStatus(driverId, "accident");
      const incident = await this.incidentRepository.create({
        title: `ДТП: ${driver.fullName}`,
        incidentType: "accident",
        status: "open",
        priority: "high",
        driverId,
        occurredAt,
        description: note ?? "ДТП зафиксировано бригадиром",
        accidentPhotoUrl,
        repairNote: note,
        managerLabel: currentUser?.id ?? null,
        serviceStage: "awaiting_repair",
        serviceCaseType: "insurance",
        servicePaymentStatus: "unpaid",
        servicePayer: "insurance",
      });
      await this.notificationsCreateService.createManagerDriverEvent(
        driverId,
        `Срочно: ДТП - ${driver.fullName}`,
        note ?? "ДТП зафиксировано по водителю",
      );
      return incident;
    }

    if (action === "impound") {
      await this.updateAssignedCarStatus(driverId, "impound");
      const incident = await this.incidentRepository.create({
        title: `Штрафстоянка: ${driver.fullName}`,
        incidentType: "impound",
        status: "open",
        priority: "high",
        driverId,
        occurredAt,
        description: note ?? "Автомобиль поставлен на штрафстоянку бригадиром",
        repairNote: note,
        managerLabel: currentUser?.id ?? null,
        serviceStage: "impound",
        serviceCaseType: "impound",
        servicePaymentStatus: "unpaid",
        servicePayer: "driver",
      });
      await this.notificationsCreateService.createManagerDriverEvent(
        driverId,
        `Срочно: штрафстоянка - ${driver.fullName}`,
        note ?? "Автомобиль поставлен на штрафстоянку",
      );
      return incident;
    }

    throw new BadRequestException("Unsupported incident action");
  }

  async getAlerts(currentUser: RequestUser | null): Promise<ManagerAlertItem[]> {
    const [alerts, users] = await Promise.all([
      this.getScopedAlerts(currentUser),
      currentUser?.companyName ? this.userRepository.listAdminByCompany(currentUser.companyName) : this.userRepository.listAdmin(),
    ]);
    const managerNameById = this.getManagerNameMap(users);
    return alerts.map((alert) => ({
      ...alert,
      managerName: alert.managerId ? managerNameById.get(alert.managerId) ?? null : null,
    }));
  }

  async getStatusRequests(currentUser: RequestUser | null): Promise<ManagerStatusRequestItem[]> {
    const [drivers, users] = await Promise.all([
      this.mobileAccessService.getScopedDrivers(currentUser),
      currentUser?.companyName ? this.userRepository.listAdminByCompany(currentUser.companyName) : this.userRepository.listAdmin(),
    ]);
    const driverById = new Map(drivers.map((driver) => [driver.id, driver]));
    const managerNameById = this.getManagerNameMap(users);
    const requests = await this.statusRequestRepository.listByDrivers(drivers.map((driver) => driver.id));

    return requests
      .filter((item) => typeof item.driverId === "string" && driverById.has(item.driverId))
      .map((item) => {
        const driverId = item.driverId as string;
        const driver = driverById.get(driverId);
        return {
          id: item.id,
          driverId,
          driverName: driver?.fullName ?? "Водитель",
          managerName: driver?.managerId ? managerNameById.get(driver.managerId) ?? null : null,
          type: item.type,
          status: item.status,
          period: item.period,
          note: item.note ?? null,
          createdAt: item.createdAt ?? "",
        };
      })
      .sort((left, right) => {
        if (left.status === "pending" && right.status !== "pending") {
          return -1;
        }
        if (left.status !== "pending" && right.status === "pending") {
          return 1;
        }
        return right.createdAt.localeCompare(left.createdAt);
      });
  }

  getQuickActions(currentUser: RequestUser | null): Promise<ManagerQuickActionItem[]> {
    return this.getScopedQuickActions(currentUser);
  }

  async getIncidents(currentUser: RequestUser | null): Promise<ManagerIncidentItem[]> {
    const drivers = await this.mobileAccessService.getScopedDrivers(currentUser);
    const scopedDriverIds = new Set(drivers.map((driver) => driver.id));
    const driverNameById = new Map(drivers.map((driver) => [driver.id, driver.fullName]));
    const incidents = currentUser?.companyName
      ? await this.incidentRepository.listByCompany(currentUser.companyName)
      : await this.incidentRepository.list();

    return incidents
      .filter((incident) => incident.driverId && scopedDriverIds.has(incident.driverId))
      .map((incident) => ({
        ...incident,
        driverName: incident.driverId ? driverNameById.get(incident.driverId) ?? incident.driverName ?? null : null,
      }));
  }

  async updateIncidentAction(
    incidentId: string,
    body: { action?: string; note?: string },
    currentUser: RequestUser | null,
  ): Promise<ManagerIncidentItem> {
    const scopedIncidents = await this.getIncidents(currentUser);
    const incident = scopedIncidents.find((item) => item.id === incidentId);
    if (!incident) {
      throw new NotFoundException("Incident not found");
    }

    const note = this.trimOrNull(body.note);
    const action = body.action?.trim();
    const patch: Parameters<IncidentRepository["update"]>[1] = {};

    if (action === "awaiting_repair") {
      patch.status = "open";
      patch.priority = "high";
      patch.serviceStage = "awaiting_repair";
      patch.repairNote = note ?? incident.repairNote ?? null;
    } else if (action === "in_repair") {
      patch.status = "open";
      patch.priority = "high";
      patch.serviceStage = "in_repair";
      patch.serviceCaseType = incident.serviceCaseType ?? "repair";
      patch.repairNote = note ?? incident.repairNote ?? null;
    } else if (action === "completed") {
      patch.status = "closed";
      patch.serviceStage = "completed";
      patch.periodLabel = this.buildCompletedIncidentPeriod(incident);
      patch.repairNote = note ?? incident.repairNote ?? null;
    } else if (action === "closed") {
      patch.status = "closed";
      patch.serviceStage = "completed";
      patch.periodLabel = this.buildCompletedIncidentPeriod(incident);
      patch.repairNote = note ?? incident.repairNote ?? null;
    } else if (action === "written_off") {
      if (!note) {
        throw new BadRequestException("Укажите причину: что именно не подлежит восстановлению");
      }

      const managerProfile = currentUser?.role === "manager"
        ? await this.userRepository.getManagerProfile(currentUser.id, currentUser.companyName ?? null)
        : null;
      const canConfirmWriteoff = currentUser?.role !== "manager" || managerProfile?.managerLevel === "senior";

      if (canConfirmWriteoff) {
        patch.status = "closed";
        patch.priority = "high";
        patch.serviceStage = "written_off";
        patch.periodLabel = this.buildCompletedIncidentPeriod(incident);
        patch.repairNote = note;
        patch.description = this.appendIncidentNote(incident.description, `Списание подтверждено: ${note}`);
        if (incident.driverId) {
          await this.notificationsCreateService.createManagerDriverEvent(
            incident.driverId,
            "Списание подтверждено",
            `${incident.driverName ?? "Водитель"}: ${note}`,
          );
        }
      } else {
        patch.status = "open";
        patch.priority = "high";
        patch.title = `Не подлежит восстановлению: ${incident.driverName ?? "водитель"}`;
        patch.serviceStage = "writeoff_requested";
        patch.serviceCaseType = incident.serviceCaseType ?? "repair";
        patch.repairNote = note;
        patch.description = this.appendIncidentNote(incident.description, `Заявка на списание: ${note}`);
        if (incident.driverId) {
          await this.notificationsCreateService.createManagerDriverEvent(
            incident.driverId,
            "Заявка на списание авто",
            `${incident.driverName ?? "Водитель"}: ${note}`,
          );
        }
      }
    } else {
      throw new BadRequestException("Unsupported incident action");
    }

    const updated = await this.incidentRepository.update(incidentId, patch);
    if (!updated) {
      throw new NotFoundException("Incident not found");
    }

    return updated;
  }

  async executeAction(actionId: string, currentUser: RequestUser | null): Promise<ManagerExecuteActionResult> {
    const action = await this.quickActionRepository.getById(actionId);
    await this.assertCanExecuteAction(action, currentUser);

    return {
      success: Boolean(action),
      actionId,
      executedAt: new Date().toISOString(),
    };
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private buildCompletedIncidentPeriod(incident: ManagerIncidentItem): string {
    if (incident.periodLabel?.includes("..")) {
      return incident.periodLabel;
    }

    return `${(incident.periodLabel || incident.occurredAt || this.today()).slice(0, 10)}..${this.today()}`;
  }

  private appendIncidentNote(current: string | null | undefined, note: string): string {
    const existing = this.trimOrNull(current);
    return existing ? `${existing}\n${note}` : note;
  }

  private trimOrNull(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private getManagerNameMap(users: Awaited<ReturnType<UserRepository["listAdmin"]>>): Map<string, string> {
    const managerNameById = new Map<string, string>();
    for (const user of users) {
      if (user.role !== "manager") {
        continue;
      }
      managerNameById.set(user.id, user.displayName);
      if (user.managerProfileId) {
        managerNameById.set(user.managerProfileId, user.displayName);
      }
    }
    return managerNameById;
  }

  private resolveIdleVehicleCategory(status: string, incident?: ManagerIncidentItem): ManagerIdleVehicleCategory {
    const source = `${status} ${incident?.incidentType ?? ""} ${incident?.serviceCaseType ?? ""} ${incident?.serviceStage ?? ""} ${incident?.title ?? ""}`.toLowerCase();
    if (source.includes("impound") || source.includes("штраф")) {
      return "impound";
    }
    if (source.includes("written_off") || source.includes("спис")) {
      return "written_off";
    }
    if (source.includes("accident") || source.includes("дтп")) {
      return "accident";
    }
    if (source.includes("insurance") || source.includes("gps") || source.includes("страх")) {
      return "insurance_gps";
    }
    if (source.includes("repair") || source.includes("service") || source.includes("maintenance") || source.includes("сто") || source.includes("ремонт")) {
      return "service";
    }
    return "office";
  }

  private getIdleVehicleCategoryLabel(category: ManagerIdleVehicleCategory): string {
    switch (category) {
      case "accident":
        return "ДТП";
      case "insurance_gps":
        return "Страховка/GPS";
      case "service":
        return "СТО";
      case "impound":
        return "Штрафстоянка";
      case "written_off":
        return "Списан";
      case "office":
      default:
        return "В офисе";
    }
  }

  private async updateAssignedCarStatus(driverId: string, status: string): Promise<void> {
    const car = await this.carRepository.getAssignedByDriver(driverId);
    if (car) {
      await this.carRepository.update(car.id, { status });
    }
  }

  private async getScopedAlerts(currentUser: RequestUser | null): Promise<ManagerAlertItem[]> {
    if (currentUser?.role === "manager") {
      const managerIds = await this.userRepository.getManagerScopeIds(currentUser.id, currentUser.companyName ?? null);
      const rows = await Promise.all([...managerIds].map((managerId) => this.managerAlertRepository.listByManager(managerId)));
      return rows.flat();
    }

    if (currentUser?.companyName) {
      return this.managerAlertRepository.listByCompany(currentUser.companyName);
    }

    return this.managerAlertRepository.list();
  }

  private async getCompanyScopedCars(currentUser: RequestUser | null): Promise<VehicleListItem[]> {
    if (!currentUser) {
      throw new ForbiddenException("Current user is required");
    }

    return currentUser.companyName
      ? this.carRepository.listByCompany(currentUser.companyName)
      : this.carRepository.list();
  }

  private canSeeAllCompanyVehicles(currentUser: RequestUser | null): boolean {
    if (!currentUser) {
      return false;
    }

    return currentUser.role === "owner"
      || currentUser.role === "admin"
      || currentUser.role === "finance"
      || (currentUser.role === "manager" && currentUser.managerLevel === "senior");
  }

  private async getScopedQuickActions(currentUser: RequestUser | null): Promise<ManagerQuickActionItem[]> {
    if (currentUser?.role === "manager") {
      const managerIds = await this.userRepository.getManagerScopeIds(currentUser.id, currentUser.companyName ?? null);
      const rows = await Promise.all([...managerIds].map((managerId) => this.quickActionRepository.listByManager(managerId)));
      return rows.flat();
    }

    if (currentUser?.companyName) {
      return this.quickActionRepository.listByCompany(currentUser.companyName);
    }

    return this.quickActionRepository.list();
  }

  private async getHistoricalFinanceSnapshots(
    drivers: Array<{ id: string; activeContractId?: string | null }>,
    currentUser: RequestUser | null,
  ): Promise<Map<string, {
    contractId: string;
    contractNumber: string;
    vehicle: string | null;
    finance: {
      currentDebt: number;
      creditBalance: number;
      overdueDebt: number;
      overdueSinceDate: string | null;
      overdueUntilDate: string | null;
      yandexBalance: number;
      nextPaymentAmount: number;
      nextPaymentDate: string | null;
      lastPaymentDate: string | null;
      reservedPayoutAmount: number;
    };
  }>> {
    const inactiveDriverIds = new Set(drivers.filter((driver) => !driver.activeContractId).map((driver) => driver.id));
    if (!inactiveDriverIds.size) {
      return new Map();
    }

    const contracts = currentUser?.companyName
      ? await this.contractRepository.listByCompany(currentUser.companyName)
      : await this.contractRepository.list();
    const latestByDriver = new Map<string, (typeof contracts)[number]>();
    for (const contract of contracts) {
      if (!inactiveDriverIds.has(contract.driverId)) {
        continue;
      }
      latestByDriver.set(contract.driverId, contract);
    }

    const rows = await Promise.all(
      [...latestByDriver.entries()].map(async ([driverId, contract]) => {
        const [detail, car] = await Promise.all([
          this.contractRepository.getById(contract.id),
          this.carRepository.getById(contract.carId),
        ]);
        const obligations = detail?.schedule?.length
          ? detail.schedule
          : await this.obligationRepository.listByDriver(driverId);
        const today = this.today();
        const open = obligations
          .map((item) => ({
            dueDate: item.deferredUntil ? this.addDays(item.deferredUntil, 1) : item.dueDate,
            remainingAmount: this.getOpenObligationAmount(item),
          }))
          .filter((item) => item.remainingAmount > 0)
          .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
        const overdue = open.filter((item) => item.dueDate < today);
        const next = open[0] ?? null;
        const isTerminatedContract = contract.status === "terminated";
        return {
          driverId,
          snapshot: {
            contractId: contract.id,
            contractNumber: contract.contractNumber,
            vehicle: car?.plateNumber ?? null,
            finance: {
              currentDebt: open.reduce((sum, item) => sum + item.remainingAmount, 0),
              creditBalance: 0,
              overdueDebt: isTerminatedContract ? 0 : overdue.reduce((sum, item) => sum + item.remainingAmount, 0),
              overdueSinceDate: isTerminatedContract ? null : overdue[0]?.dueDate ?? null,
              overdueUntilDate: isTerminatedContract ? null : overdue[overdue.length - 1]?.dueDate ?? null,
              yandexBalance: 0,
              nextPaymentAmount: isTerminatedContract ? 0 : next?.remainingAmount ?? 0,
              nextPaymentDate: isTerminatedContract ? null : next?.dueDate ?? null,
              lastPaymentDate: null,
              reservedPayoutAmount: 0,
            },
          },
        };
      }),
    );

    return new Map(rows.map((row) => [row.driverId, row.snapshot]));
  }

  private getOpenObligationAmount(item: { type: string; amount: number; paidAmount: number; installmentAmount?: number | null }): number {
    if (item.type !== "installment") {
      return Math.max(0, item.amount - item.paidAmount);
    }

    const installmentAmount = item.installmentAmount ?? item.amount;
    const paidTowardInstallment = Math.min(Math.max(0, item.paidAmount), installmentAmount);
    return Math.max(0, installmentAmount - paidTowardInstallment);
  }

  private mergeHistoricalFinance<T extends {
    currentDebt: number;
    creditBalance: number;
    overdueDebt: number;
    overdueSinceDate: string | null;
    overdueUntilDate: string | null;
    yandexBalance: number;
    nextPaymentAmount: number;
    nextPaymentDate: string | null;
    lastPaymentDate: string | null;
  }>(historical: T, live?: T): T {
    return {
      ...historical,
      creditBalance: live?.creditBalance ?? historical.creditBalance,
      yandexBalance: live?.yandexBalance ?? historical.yandexBalance,
      lastPaymentDate: live?.lastPaymentDate ?? historical.lastPaymentDate,
    };
  }

  private async getDriverIncidentHistory(driverId: string, currentUser: RequestUser | null): Promise<ManagerIncidentItem[]> {
    const incidents = currentUser?.companyName
      ? await this.incidentRepository.listByCompany(currentUser.companyName)
      : await this.incidentRepository.list();

    return incidents
      .filter((incident) => incident.driverId === driverId)
      .sort((left, right) => (right.occurredAt ?? "").localeCompare(left.occurredAt ?? ""))
      .slice(0, 12);
  }

  private addDays(date: string, days: number): string {
    const source = new Date(`${date}T00:00:00.000Z`);
    source.setUTCDate(source.getUTCDate() + days);
    return source.toISOString().slice(0, 10);
  }

  private async assertCanExecuteAction(
    action: ManagerQuickActionItem | null,
    currentUser: RequestUser | null,
  ): Promise<void> {
    if (!currentUser) {
      throw new ForbiddenException("Current user is required");
    }

    if (currentUser.role !== "manager" && !currentUser.companyName) {
      return;
    }

    if (!action) {
      throw new ForbiddenException("Quick action not found");
    }

    if (currentUser.role === "manager") {
      const managerIds = await this.userRepository.getManagerScopeIds(currentUser.id, currentUser.companyName ?? null);
      if (!action.managerId || !managerIds.has(action.managerId)) {
      throw new ForbiddenException("Managers can execute only their own quick actions");
      }
    }

    if (currentUser.companyName) {
      const users = await this.userRepository.listAdminByCompany(currentUser.companyName);
      const manager = users.find((item) => (
        item.role === "manager"
        && (item.managerProfileId === action.managerId || item.id === action.managerId)
      ));

      if (!matchesCompanyScope(currentUser, manager?.companyName)) {
        throw new ForbiddenException("Current company cannot execute this quick action");
      }
    }
  }
}
