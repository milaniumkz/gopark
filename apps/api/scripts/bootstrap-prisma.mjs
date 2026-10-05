import { createRequire } from "node:module";
import { randomBytes, scryptSync } from "node:crypto";

const require = createRequire(import.meta.url);

function createPasswordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const N = 16384;
  const r = 8;
  const p = 1;
  const derived = scryptSync(password, salt, 64, { N, r, p }).toString("hex");
  return `scrypt$${N}$${r}$${p}$${salt}$${derived}`;
}

async function main() {
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();

  try {
    await prisma.settings.upsert({
      where: { id: "00000000-0000-0000-0000-000000000001" },
      update: {
        payoutApprovalThreshold: 10000,
        defaultInstallmentDay: 15,
        yandexSyncIntervalMinutes: 30,
        bakaiWebhookEnabled: true,
        allowedStatusRequestTypes: ["day_off", "vacation", "force_majeure"],
        notificationChannels: ["push", "sms", "in_app"],
      },
      create: {
        id: "00000000-0000-0000-0000-000000000001",
        payoutApprovalThreshold: 10000,
        defaultInstallmentDay: 15,
        yandexSyncIntervalMinutes: 30,
        bakaiWebhookEnabled: true,
        allowedStatusRequestTypes: ["day_off", "vacation", "force_majeure"],
        notificationChannels: ["push", "sms", "in_app"],
      },
    });

    const alerts = [
      {
        id: "00000000-0000-0000-0000-000000000101",
        title: "Просрочка платежа",
        details: "Эмир Токтогулов · 23 000 сом",
        managerId: "00000000-0000-0000-0000-000000000402",
      },
      {
        id: "00000000-0000-0000-0000-000000000102",
        title: "Страховка истекает",
        details: "2 автомобиля · срок менее 7 дней",
        managerId: "00000000-0000-0000-0000-000000000401",
      },
    ];

    for (const alert of alerts) {
      await prisma.managerAlert.upsert({
        where: { id: alert.id },
        update: {
          title: alert.title,
          details: alert.details,
          managerId: alert.managerId,
        },
        create: alert,
      });
    }

    const actions = [
      {
        id: "00000000-0000-0000-0000-000000000201",
        label: "Позвонить водителю",
        target: "Эмир Токтогулов",
        managerId: "00000000-0000-0000-0000-000000000402",
      },
      {
        id: "00000000-0000-0000-0000-000000000202",
        label: "Сменить статус",
        target: "Бакыт Алиев",
        managerId: "00000000-0000-0000-0000-000000000401",
      },
      {
        id: "00000000-0000-0000-0000-000000000203",
        label: "Открыть кейс просрочки",
        target: "Долг > 20 000 сом",
        managerId: "00000000-0000-0000-0000-000000000402",
      },
    ];

    for (const action of actions) {
      await prisma.quickAction.upsert({
        where: { id: action.id },
        update: {
          label: action.label,
          target: action.target,
          managerId: action.managerId,
        },
        create: action,
      });
    }

    const users = [
      {
        key: "owner_1",
        id: "00000000-0000-0000-0000-000000000305",
        email: "owner@gopark.local",
        phone: null,
        password: "owner123",
        role: "owner",
        status: "active",
        mfaEnabled: true,
        firstName: "GoPark",
        lastName: "Owner",
      },
      {
        key: "admin_1",
        id: "00000000-0000-0000-0000-000000000301",
        email: "admin@gopark.local",
        phone: null,
        password: "admin123",
        role: "admin",
        status: "active",
        mfaEnabled: true,
        firstName: "GoPark",
        lastName: "Admin",
      },
      {
        key: "finance_1",
        id: "00000000-0000-0000-0000-000000000306",
        email: "finance@gopark.local",
        phone: null,
        password: "finance123",
        role: "finance",
        status: "active",
        mfaEnabled: true,
        firstName: "Айжан",
        lastName: "Финансы",
      },
      {
        key: "manager_1",
        id: "00000000-0000-0000-0000-000000000303",
        email: "manager@gopark.local",
        phone: null,
        password: "manager123",
        role: "manager",
        status: "active",
        mfaEnabled: false,
        firstName: "Нурлан",
        lastName: "Менеджер",
      },
      {
        key: "manager_2",
        id: "00000000-0000-0000-0000-000000000304",
        email: "manager2@gopark.local",
        phone: null,
        password: "manager123",
        role: "manager",
        status: "active",
        mfaEnabled: false,
        firstName: "Айбек",
        lastName: "Менеджер",
      },
      {
        key: "operator_1",
        id: "00000000-0000-0000-0000-000000000307",
        email: "operator@gopark.local",
        phone: null,
        password: "operator123",
        role: "operator",
        status: "active",
        mfaEnabled: false,
        firstName: "CRM",
        lastName: "Оператор",
      },
      {
        key: "auditor_1",
        id: "00000000-0000-0000-0000-000000000308",
        email: "auditor@gopark.local",
        phone: null,
        password: "auditor123",
        role: "auditor",
        status: "active",
        mfaEnabled: true,
        firstName: "CRM",
        lastName: "Аудитор",
      },
      {
        key: "driver_1",
        id: "00000000-0000-0000-0000-000000000302",
        email: null,
        phone: "+996555123456",
        password: "driver123",
        role: "driver",
        status: "active",
        mfaEnabled: false,
        firstName: "Алексей",
        lastName: "Иванов",
      },
    ];

    const upsertedUsers = new Map();

    for (const user of users) {
      const upsertedUser = await prisma.user.upsert({
        where: user.email ? { email: user.email } : { phone: user.phone },
        update: {
          passwordHash: createPasswordHash(user.password),
          role: user.role,
          status: user.status,
          mfaEnabled: user.mfaEnabled,
          firstName: user.firstName,
          lastName: user.lastName,
        },
        create: {
          id: user.id,
          email: user.email,
          phone: user.phone,
          passwordHash: createPasswordHash(user.password),
          role: user.role,
          status: user.status,
          mfaEnabled: user.mfaEnabled,
          firstName: user.firstName,
          lastName: user.lastName,
        },
      });

      upsertedUsers.set(user.key, upsertedUser);
    }

    const managers = [
      {
        key: "manager_1",
        id: "00000000-0000-0000-0000-000000000401",
        title: "Brigade Lead 1",
      },
      {
        key: "manager_2",
        id: "00000000-0000-0000-0000-000000000402",
        title: "Brigade Lead 2",
      },
    ];

    const upsertedManagers = new Map();

    for (const manager of managers) {
      const upsertedManager = await prisma.manager.upsert({
        where: { userId: upsertedUsers.get(manager.key).id },
        update: {
          title: manager.title,
        },
        create: {
          id: manager.id,
          userId: upsertedUsers.get(manager.key).id,
          title: manager.title,
        },
      });

      upsertedManagers.set(manager.key, upsertedManager);
    }

    const drivers = [
      {
        id: "00000000-0000-0000-0000-000000000501",
        userKey: "driver_1",
        managerKey: "manager_1",
        firstName: "Алексей",
        lastName: "Иванов",
        phone: "+996555123456",
      },
      {
        id: "00000000-0000-0000-0000-000000000502",
        userKey: null,
        managerKey: "manager_2",
        firstName: "Эмир",
        lastName: "Токтогулов",
        phone: "+996555234567",
      },
    ];

    const upsertedDrivers = new Map();

    for (const driver of drivers) {
      const upsertedDriver = await prisma.driver.upsert({
        where: { phone: driver.phone },
        update: {
          userId: driver.userKey ? upsertedUsers.get(driver.userKey).id : null,
          managerId: upsertedManagers.get(driver.managerKey).id,
          firstName: driver.firstName,
          lastName: driver.lastName,
          status: "active",
        },
        create: {
          id: driver.id,
          userId: driver.userKey ? upsertedUsers.get(driver.userKey).id : null,
          managerId: upsertedManagers.get(driver.managerKey).id,
          firstName: driver.firstName,
          lastName: driver.lastName,
          phone: driver.phone,
          status: "active",
        },
      });

      upsertedDrivers.set(driver.id, upsertedDriver);
    }

    const cars = [
      {
        id: "00000000-0000-0000-0000-000000000601",
        logicalId: "car_1",
        vin: "LGXC16EF5P0123456",
        plateNumber: "01 KG 1234",
        make: "Hyundai",
        model: "Solaris",
        productionYear: 2023,
        color: "White",
        purchasePrice: "780000.00",
        customsCost: "65000.00",
        deliveryCost: "25000.00",
        repairCost: "18000.00",
        targetSalePrice: "940000.00",
        status: "assigned",
      },
      {
        id: "00000000-0000-0000-0000-000000000602",
        logicalId: "car_2",
        vin: "Z94CB41AABR123456",
        plateNumber: "01 KG 5678",
        make: "Kia",
        model: "Rio",
        productionYear: 2022,
        color: "Gray",
        purchasePrice: "420000.00",
        customsCost: "40000.00",
        deliveryCost: "18000.00",
        repairCost: "12000.00",
        targetSalePrice: "560000.00",
        status: "assigned",
      },
    ];

    const upsertedCars = new Map();

    for (const car of cars) {
      const upsertedCar = await prisma.car.upsert({
        where: { vin: car.vin },
        update: {
          plateNumber: car.plateNumber,
          make: car.make,
          model: car.model,
          productionYear: car.productionYear,
          color: car.color,
          purchasePrice: car.purchasePrice,
          customsCost: car.customsCost,
          deliveryCost: car.deliveryCost,
          repairCost: car.repairCost,
          targetSalePrice: car.targetSalePrice,
          status: car.status,
        },
        create: {
          id: car.id,
          vin: car.vin,
          plateNumber: car.plateNumber,
          make: car.make,
          model: car.model,
          productionYear: car.productionYear,
          color: car.color,
          purchasePrice: car.purchasePrice,
          customsCost: car.customsCost,
          deliveryCost: car.deliveryCost,
          repairCost: car.repairCost,
          targetSalePrice: car.targetSalePrice,
          status: car.status,
        },
      });

      upsertedCars.set(car.logicalId, upsertedCar);
    }

    const assignments = [
      {
        id: "00000000-0000-0000-0000-000000000651",
        carId: "car_1",
        driverId: "00000000-0000-0000-0000-000000000501",
        startedAt: new Date("2025-01-15T08:00:00.000Z"),
      },
      {
        id: "00000000-0000-0000-0000-000000000652",
        carId: "car_2",
        driverId: "00000000-0000-0000-0000-000000000502",
        startedAt: new Date("2025-02-01T08:00:00.000Z"),
      },
    ];

    for (const assignment of assignments) {
      await prisma.carAssignment.upsert({
        where: { id: assignment.id },
        update: {
          carId: upsertedCars.get(assignment.carId).id,
          driverId: upsertedDrivers.get(assignment.driverId).id,
          startedAt: assignment.startedAt,
          endedAt: null,
        },
        create: {
          id: assignment.id,
          carId: upsertedCars.get(assignment.carId).id,
          driverId: upsertedDrivers.get(assignment.driverId).id,
          startedAt: assignment.startedAt,
        },
      });
    }

    const contracts = [
      {
        id: "00000000-0000-0000-0000-000000000701",
        logicalId: "ctr_1",
        driverId: "00000000-0000-0000-0000-000000000501",
        carId: "car_1",
        contractNumber: "GP-2025-0001",
        principalAmount: "1000000.00",
        upfrontAmount: "150000.00",
        financedAmount: "850000.00",
        installmentAmount: "30000.00",
        installmentDay: 15,
        termMonths: 24,
        startDate: new Date("2025-01-15T00:00:00.000Z"),
      },
      {
        id: "00000000-0000-0000-0000-000000000702",
        logicalId: "ctr_2",
        driverId: "00000000-0000-0000-0000-000000000502",
        carId: "car_2",
        contractNumber: "GP-2025-0002",
        principalAmount: "450000.00",
        upfrontAmount: "130000.00",
        financedAmount: "320000.00",
        installmentAmount: "25000.00",
        installmentDay: 15,
        termMonths: 18,
        startDate: new Date("2025-02-01T00:00:00.000Z"),
      },
    ];

    const upsertedContracts = new Map();

    for (const contract of contracts) {
      const upsertedContract = await prisma.contract.upsert({
        where: { contractNumber: contract.contractNumber },
        update: {
          driverId: upsertedDrivers.get(contract.driverId).id,
          carId: upsertedCars.get(contract.carId).id,
          status: "active",
          principalAmount: contract.principalAmount,
          upfrontAmount: contract.upfrontAmount,
          financedAmount: contract.financedAmount,
          installmentAmount: contract.installmentAmount,
          installmentDay: contract.installmentDay,
          termMonths: contract.termMonths,
          startDate: contract.startDate,
        },
        create: {
          id: contract.id,
          driverId: upsertedDrivers.get(contract.driverId).id,
          carId: upsertedCars.get(contract.carId).id,
          status: "active",
          contractNumber: contract.contractNumber,
          principalAmount: contract.principalAmount,
          upfrontAmount: contract.upfrontAmount,
          financedAmount: contract.financedAmount,
          installmentAmount: contract.installmentAmount,
          installmentDay: contract.installmentDay,
          termMonths: contract.termMonths,
          startDate: contract.startDate,
        },
      });

      upsertedContracts.set(contract.logicalId, upsertedContract);
    }

    const obligations = [
      {
        id: "00000000-0000-0000-0000-000000000801",
        driverId: "00000000-0000-0000-0000-000000000501",
        contractId: "ctr_1",
        amount: "30000.00",
        paidAmount: "25000.00",
        overdueAmount: "0.00",
        dueDate: new Date("2026-03-15T00:00:00.000Z"),
      },
      {
        id: "00000000-0000-0000-0000-000000000802",
        driverId: "00000000-0000-0000-0000-000000000502",
        contractId: "ctr_2",
        amount: "25000.00",
        paidAmount: "12000.00",
        overdueAmount: "0.00",
        dueDate: new Date("2026-03-15T00:00:00.000Z"),
      },
    ];

    const upsertedObligations = new Map();

    for (const obligation of obligations) {
      const upsertedObligation = await prisma.obligation.upsert({
        where: { id: obligation.id },
        update: {
          contractId: upsertedContracts.get(obligation.contractId).id,
          driverId: upsertedDrivers.get(obligation.driverId).id,
          type: "installment",
          dueDate: obligation.dueDate,
          amount: obligation.amount,
          paidAmount: obligation.paidAmount,
          overdueAmount: obligation.overdueAmount,
        },
        create: {
          id: obligation.id,
          contractId: upsertedContracts.get(obligation.contractId).id,
          driverId: upsertedDrivers.get(obligation.driverId).id,
          type: "installment",
          dueDate: obligation.dueDate,
          amount: obligation.amount,
          paidAmount: obligation.paidAmount,
          overdueAmount: obligation.overdueAmount,
        },
      });

      upsertedObligations.set(obligation.id, upsertedObligation);
    }

    const payments = [
      {
        id: "00000000-0000-0000-0000-000000000901",
        logicalId: "pay_1",
        driverId: "00000000-0000-0000-0000-000000000501",
        contractId: "ctr_1",
        obligationId: "00000000-0000-0000-0000-000000000801",
        provider: "bakai",
        providerPaymentId: "bakai-payment-1",
        idempotencyKey: "pay_1",
        status: "succeeded",
        amount: "25000.00",
        requestedAt: new Date("2025-04-01T09:00:00.000Z"),
        processedAt: new Date("2025-04-01T09:00:00.000Z"),
        createdAt: new Date("2025-04-01T09:00:00.000Z"),
      },
      {
        id: "00000000-0000-0000-0000-000000000902",
        logicalId: "pay_2",
        driverId: "00000000-0000-0000-0000-000000000502",
        contractId: "ctr_2",
        obligationId: "00000000-0000-0000-0000-000000000802",
        provider: "bakai",
        providerPaymentId: "bakai-payment-2",
        idempotencyKey: "pay_2",
        status: "processing",
        amount: "12000.00",
        requestedAt: new Date("2025-04-03T09:00:00.000Z"),
        processedAt: null,
        createdAt: new Date("2025-04-03T09:00:00.000Z"),
      },
    ];

    const upsertedPayments = new Map();

    for (const payment of payments) {
      const upsertedPayment = await prisma.payment.upsert({
        where: { idempotencyKey: payment.idempotencyKey },
        update: {
          driverId: upsertedDrivers.get(payment.driverId).id,
          contractId: upsertedContracts.get(payment.contractId).id,
          obligationId: upsertedObligations.get(payment.obligationId).id,
          provider: payment.provider,
          providerPaymentId: payment.providerPaymentId,
          status: payment.status,
          amount: payment.amount,
          requestedAt: payment.requestedAt,
          processedAt: payment.processedAt,
          createdAt: payment.createdAt,
        },
        create: {
          id: payment.id,
          driverId: upsertedDrivers.get(payment.driverId).id,
          contractId: upsertedContracts.get(payment.contractId).id,
          obligationId: upsertedObligations.get(payment.obligationId).id,
          provider: payment.provider,
          providerPaymentId: payment.providerPaymentId,
          idempotencyKey: payment.idempotencyKey,
          status: payment.status,
          amount: payment.amount,
          requestedAt: payment.requestedAt,
          processedAt: payment.processedAt,
          createdAt: payment.createdAt,
        },
      });

      upsertedPayments.set(payment.logicalId, upsertedPayment);
    }

    const payouts = [
      {
        id: "00000000-0000-0000-0000-000000000951",
        driverId: "00000000-0000-0000-0000-000000000501",
        amount: "8500.00",
        status: "requested",
        idempotencyKey: "po_1",
        requestedAt: new Date("2025-04-02T10:30:00.000Z"),
        createdAt: new Date("2025-04-02T10:30:00.000Z"),
      },
    ];

    for (const payout of payouts) {
      await prisma.payout.upsert({
        where: { idempotencyKey: payout.idempotencyKey },
        update: {
          driverId: upsertedDrivers.get(payout.driverId).id,
          amount: payout.amount,
          status: payout.status,
          requestedAt: payout.requestedAt,
          createdAt: payout.createdAt,
        },
        create: {
          id: payout.id,
          driverId: upsertedDrivers.get(payout.driverId).id,
          amount: payout.amount,
          status: payout.status,
          idempotencyKey: payout.idempotencyKey,
          requestedAt: payout.requestedAt,
          createdAt: payout.createdAt,
        },
      });
    }

    const yandexBalances = [
      {
        id: "00000000-0000-0000-0000-000000000971",
        driverId: "00000000-0000-0000-0000-000000000501",
        externalDriverId: "yandex_drv_1",
        amount: "45680.00",
        syncedAt: new Date("2025-04-03T11:00:00.000Z"),
      },
      {
        id: "00000000-0000-0000-0000-000000000972",
        driverId: "00000000-0000-0000-0000-000000000502",
        externalDriverId: "yandex_drv_2",
        amount: "28750.00",
        syncedAt: new Date("2025-04-03T11:00:00.000Z"),
      },
    ];

    for (const balance of yandexBalances) {
      await prisma.yandexBalance.upsert({
        where: { id: balance.id },
        update: {
          driverId: upsertedDrivers.get(balance.driverId).id,
          externalDriverId: balance.externalDriverId,
          amount: balance.amount,
          syncedAt: balance.syncedAt,
        },
        create: {
          id: balance.id,
          driverId: upsertedDrivers.get(balance.driverId).id,
          externalDriverId: balance.externalDriverId,
          amount: balance.amount,
          syncedAt: balance.syncedAt,
          createdAt: balance.syncedAt,
        },
      });
    }

    const statusRequests = [
      {
        id: "00000000-0000-0000-0000-000000000981",
        driverId: "00000000-0000-0000-0000-000000000501",
        type: "vacation",
        status: "approved",
        period: "2026-04-01 .. 2026-04-07",
        createdAt: new Date("2025-04-04T08:00:00.000Z"),
      },
      {
        id: "00000000-0000-0000-0000-000000000982",
        driverId: "00000000-0000-0000-0000-000000000501",
        type: "day_off",
        status: "pending",
        period: "2026-03-20",
        createdAt: new Date("2025-04-04T09:00:00.000Z"),
      },
    ];

    for (const request of statusRequests) {
      await prisma.driverStatusRequest.upsert({
        where: { id: request.id },
        update: {
          driverId: upsertedDrivers.get(request.driverId).id,
          type: request.type,
          status: request.status,
          period: request.period,
          createdAt: request.createdAt,
        },
        create: {
          id: request.id,
          driverId: upsertedDrivers.get(request.driverId).id,
          type: request.type,
          status: request.status,
          period: request.period,
          createdAt: request.createdAt,
        },
      });
    }

    const incidents = [
      {
        id: "00000000-0000-0000-0000-000000000991",
        title: "Просрочка платежа",
        incidentType: "finance",
        status: "open",
        priority: "high",
        driverId: "00000000-0000-0000-0000-000000000502",
        carId: null,
        createdAt: new Date("2025-04-05T08:00:00.000Z"),
      },
      {
        id: "00000000-0000-0000-0000-000000000992",
        title: "Страховка истекает",
        incidentType: "insurance",
        status: "open",
        priority: "medium",
        driverId: null,
        carId: "car_1",
        createdAt: new Date("2025-04-05T08:30:00.000Z"),
      },
    ];

    for (const incident of incidents) {
      await prisma.incident.upsert({
        where: { id: incident.id },
        update: {
          title: incident.title,
          incidentType: incident.incidentType,
          status: incident.status,
          priority: incident.priority,
          driverId: incident.driverId ? upsertedDrivers.get(incident.driverId).id : null,
          carId: incident.carId ? upsertedCars.get(incident.carId).id : null,
          createdAt: incident.createdAt,
        },
        create: {
          id: incident.id,
          title: incident.title,
          incidentType: incident.incidentType,
          status: incident.status,
          priority: incident.priority,
          driverId: incident.driverId ? upsertedDrivers.get(incident.driverId).id : null,
          carId: incident.carId ? upsertedCars.get(incident.carId).id : null,
          createdAt: incident.createdAt,
        },
      });
    }

    await prisma.notification.upsert({
      where: { id: "00000000-0000-0000-0000-000000001001" },
      update: {
        userId: upsertedUsers.get("admin_1").id,
        channel: "push",
        templateCode: "payout_requested",
        payload: { payoutId: "po_1" },
        status: "pending",
      },
      create: {
        id: "00000000-0000-0000-0000-000000001001",
        userId: upsertedUsers.get("admin_1").id,
        channel: "push",
        templateCode: "payout_requested",
        payload: { payoutId: "po_1" },
        status: "pending",
      },
    });

    await prisma.outboxEvent.upsert({
      where: { id: "00000000-0000-0000-0000-000000001011" },
      update: {
        topic: "payment.created",
        aggregateType: "payment",
        aggregateId: upsertedPayments.get("pay_1").id,
        payload: { paymentId: upsertedPayments.get("pay_1").id },
        status: "pending",
        createdAt: new Date("2025-04-01T10:00:00.000Z"),
      },
      create: {
        id: "00000000-0000-0000-0000-000000001011",
        topic: "payment.created",
        aggregateType: "payment",
        aggregateId: upsertedPayments.get("pay_1").id,
        payload: { paymentId: upsertedPayments.get("pay_1").id },
        status: "pending",
        createdAt: new Date("2025-04-01T10:00:00.000Z"),
      },
    });

    await prisma.auditLog.upsert({
      where: { id: "00000000-0000-0000-0000-000000001021" },
      update: {
        actorUserId: upsertedUsers.get("admin_1").id,
        action: "driver.created",
        entityType: "driver",
        entityId: upsertedDrivers.get("00000000-0000-0000-0000-000000000501").id,
        afterData: { driverId: upsertedDrivers.get("00000000-0000-0000-0000-000000000501").id },
        correlationId: "corr_1",
        createdAt: new Date("2025-04-01T08:00:00.000Z"),
      },
      create: {
        id: "00000000-0000-0000-0000-000000001021",
        actorUserId: upsertedUsers.get("admin_1").id,
        action: "driver.created",
        entityType: "driver",
        entityId: upsertedDrivers.get("00000000-0000-0000-0000-000000000501").id,
        afterData: { driverId: upsertedDrivers.get("00000000-0000-0000-0000-000000000501").id },
        correlationId: "corr_1",
        createdAt: new Date("2025-04-01T08:00:00.000Z"),
      },
    });

    const driver1AccountCode = `acct_${upsertedDrivers.get("00000000-0000-0000-0000-000000000501").id}`;
    const driver2AccountCode = `acct_${upsertedDrivers.get("00000000-0000-0000-0000-000000000502").id}`;

    const ledgerAccounts = [
      {
        id: "00000000-0000-0000-0000-000000001101",
        code: driver1AccountCode,
        name: "Driver 1 settlement",
      },
      {
        id: "00000000-0000-0000-0000-000000001102",
        code: driver2AccountCode,
        name: "Driver 2 settlement",
      },
    ];

    const upsertedAccounts = new Map();

    for (const account of ledgerAccounts) {
      const upsertedAccount = await prisma.ledgerAccount.upsert({
        where: { code: account.code },
        update: {
          name: account.name,
        },
        create: {
          id: account.id,
          code: account.code,
          name: account.name,
        },
      });

      upsertedAccounts.set(account.code, upsertedAccount);
    }

    const ledgerEntries = [
      {
        id: "00000000-0000-0000-0000-000000001111",
        accountCode: driver1AccountCode,
        contractId: "ctr_1",
        driverId: "00000000-0000-0000-0000-000000000501",
        paymentId: "pay_1",
        payoutId: null,
        entryType: "payment",
        amount: "25000.00",
        direction: 1,
        idempotencyKey: "led_1",
        externalReference: "bakai-payment-1",
        description: "Initial payment",
        postedAt: new Date("2025-04-01T09:00:00.000Z"),
      },
      {
        id: "00000000-0000-0000-0000-000000001112",
        accountCode: driver1AccountCode,
        contractId: "ctr_1",
        driverId: "00000000-0000-0000-0000-000000000501",
        paymentId: null,
        payoutId: null,
        entryType: "obligation",
        amount: "30000.00",
        direction: -1,
        idempotencyKey: "led_2",
        externalReference: null,
        description: "Monthly installment",
        postedAt: new Date("2025-04-02T09:00:00.000Z"),
      },
    ];

    for (const entry of ledgerEntries) {
      await prisma.ledgerEntry.upsert({
        where: { id: entry.id },
        update: {
          accountId: upsertedAccounts.get(entry.accountCode).id,
          contractId: upsertedContracts.get(entry.contractId).id,
          driverId: upsertedDrivers.get(entry.driverId).id,
          paymentId: entry.paymentId ? upsertedPayments.get(entry.paymentId).id : null,
          payoutId: entry.payoutId,
          entryType: entry.entryType,
          amount: entry.amount,
          direction: entry.direction,
          idempotencyKey: entry.idempotencyKey,
          externalReference: entry.externalReference,
          description: entry.description,
          postedAt: entry.postedAt,
        },
        create: {
          id: entry.id,
          accountId: upsertedAccounts.get(entry.accountCode).id,
          contractId: upsertedContracts.get(entry.contractId).id,
          driverId: upsertedDrivers.get(entry.driverId).id,
          paymentId: entry.paymentId ? upsertedPayments.get(entry.paymentId).id : null,
          payoutId: entry.payoutId,
          entryType: entry.entryType,
          amount: entry.amount,
          direction: entry.direction,
          idempotencyKey: entry.idempotencyKey,
          externalReference: entry.externalReference,
          description: entry.description,
          postedAt: entry.postedAt,
        },
      });
    }

    console.log("Prisma bootstrap seed completed");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
