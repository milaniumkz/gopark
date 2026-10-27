import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { ServiceRepairDetails } from "@gopark/contracts";
/** Runs inside the incident transaction; expense IDs identify immutable stock operations. */
export async function applyServiceInventory(
  tx: any,
  incident: any,
  previous: any | undefined,
  scope: string | null | undefined,
): Promise<void> {
  const details = incident.serviceDetails as ServiceRepairDetails | undefined;
  if (!details?.expenses) return;
  const old = (previous?.serviceDetails?.expenses ?? []) as NonNullable<
    ServiceRepairDetails["expenses"]
  >;
  for (const e of old.filter((e) => e.inventoryApplied))
    if (!details.expenses.some((x) => x.id === e.id))
      throw new BadRequestException(
        "Сохранённый складской расход нельзя удалять. Сначала оформите корректировку склада.",
      );
  let changed = false;
  const expenses = [];
  const car = incident.carId
    ? await tx.car.findUnique({
        where: { id: incident.carId },
        select: { companyName: true, plateNumber: true },
      })
    : null;
  const requesterCompany =
    scope ?? car?.companyName ?? details.manualVehicle?.companyName ?? "GoPark";
  for (const expense of details.expenses) {
    const prev = old.find((e) => e.id === expense.id);
    if (prev?.inventoryApplied) {
      if (
        expense.inventoryMode !== prev.inventoryMode ||
        expense.purchaser !== prev.purchaser ||
        expense.amount !== prev.amount ||
        (expense.partId && expense.partId !== prev.partId)
      )
        throw new BadRequestException(
          "Проведённый складской расход нельзя изменять. Оформите корректировку склада.",
        );
      expenses.push({
        ...expense,
        partId: prev.partId,
        inventoryApplied: true,
      });
      continue;
    }
    if (!expense.inventoryMode) {
      const { inventoryApplied, ...record } = expense;
      expenses.push(record);
      continue;
    }
    if (scope === undefined)
      throw new ForbiddenException("Складские расходы оформляет сотрудник СТО");
    if (expense.purchaser !== "company")
      throw new BadRequestException(
        "Автоматические складские движения доступны для расходов GoPark",
      );
    let part: any;
    if (expense.inventoryMode === "purchase") {
      part = await tx.part.create({
        data: {
          name: expense.description.trim(),
          companyName:
            scope ??
            car?.companyName ??
            details.manualVehicle?.companyName ??
            null,
          quantity: 1,
          minQuantity: 0,
          unit: "шт",
          unitPrice: expense.amount,
        },
      });
      await tx.partMovement.create({
        data: {
          partId: part.id,
          incidentId: incident.id,
          expenseId: expense.id,
          type: "receive",
          quantity: 1,
          unitPrice: expense.amount,
          requesterCompany,
          reason: `Приобретение для заказ-наряда № ${details.orderNumber ?? "—"}`,
        },
      });
    } else {
      part = await tx.part.findFirst({
        where: { id: expense.partId, ...(scope ? { companyName: scope } : {}) },
      });
      if (!part)
        throw new BadRequestException(
          "Запчасть не найдена на доступном складе",
        );
      if (
        part.unitPrice !== null &&
        Math.abs(Number(part.unitPrice) - expense.amount!) > 0.001
      )
        throw new BadRequestException(
          "Стоимость запчасти на складе изменилась. Выберите её повторно",
        );
    }
    const result = await tx.part.updateMany({
      where: { id: part.id, quantity: { gte: 1 } },
      data: { quantity: { decrement: 1 } },
    });
    if (result.count !== 1)
      throw new BadRequestException(
        "Недостаточно запчастей на складе. Обновите выбор запчасти",
      );
    await tx.partMovement.create({
      data: {
        partId: part.id,
        incidentId: incident.id,
        expenseId: expense.id,
        carId: incident.carId ?? null,
        type: "writeoff",
        quantity: 1,
        unitPrice: expense.amount,
        requesterCompany,
        reason: `Заказ-наряд № ${details.orderNumber ?? "—"} · ${car?.plateNumber ?? details.manualVehicle?.plateNumber ?? incident.title}`,
      },
    });
    expenses.push({ ...expense, partId: part.id, inventoryApplied: true });
    changed = true;
  }
  if (
    changed ||
    JSON.stringify(expenses) !== JSON.stringify(details.expenses)
  ) {
    const next = { ...details, expenses };
    await tx.incident.update({
      where: { id: incident.id },
      data: { serviceDetails: next },
    });
    incident.serviceDetails = next;
  }
}
