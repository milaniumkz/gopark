import {
  normalizeServicePayments,
  recalculateServiceCosts,
} from "@gopark/contracts";
import { BadRequestException, ConflictException } from "@nestjs/common";
import type {
  AccidentDetails,
  ServiceRepairDetails,
  ManagerIncidentItem,
} from "@gopark/contracts";
import type { UpdateIncidentRecord } from "./incident.repository.js";
const stages = ["sent_to_service", "awaiting_repair", "in_repair", "completed"];
function fail(message: string): never {
  throw new BadRequestException(message);
}
function date(value: unknown, label: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
    fail(`${label}: укажите корректную дату`);
  return value;
}
export function validateAccident(value: AccidentDetails): AccidentDetails {
  if (
    !value ||
    !["location", "otherPlate", "otherMake", "otherModel"].every(
      (k) => typeof (value as any)[k] === "string" && (value as any)[k].trim(),
    )
  )
    fail("Укажите место ДТП, госномер, марку и модель второго участника");
  date(value.occurredAt, "Дата ДТП");
  if (Date.parse(value.occurredAt) > Date.now())
    fail("Дата ДТП не может быть в будущем");
  if (
    !["driver", "other", "both", "unknown"].includes(value.fault) ||
    !["gosstrakh", "nsk", "alma"].includes(value.insurer)
  )
    fail("Укажите виновника и страховую компанию");
  return value;
}
export function isServiceRepair(incident: {
  incidentType?: string;
  serviceStage?: string | null;
  serviceDetails?: ServiceRepairDetails | null;
}): boolean {
  if (
    ["inspection", "impound", "insurance_gps"].includes(
      incident.incidentType ?? "",
    )
  )
    return false;
  return (
    incident.incidentType === "repair" ||
    !!incident.serviceDetails ||
    stages.includes(incident.serviceStage ?? "")
  );
}
/** All writes, including mobile and repository callers, share these invariants. */
export function serviceWorkflow(
  input: UpdateIncidentRecord,
  previous?: ManagerIncidentItem,
): UpdateIncidentRecord {
  if (input.accidentDetails) validateAccident(input.accidentDetails);
  const merged = { ...previous, ...input };
  const isRepair = isServiceRepair(merged);
  if (!isRepair) return {};
  const details = {
    ...(previous?.serviceDetails
      ? normalizeServicePayments(previous.serviceDetails)
      : {}),
    ...(input.serviceDetails ?? {}),
  } as ServiceRepairDetails;
  if (
    details.repairCategory !== undefined &&
    !["repair", "accident", "accident_repair"].includes(details.repairCategory)
  )
    fail("Выберите вид случая: ремонт, ДТП или ДТП и ремонт");
  if (
    details.manualVehicle &&
    ![
      details.manualVehicle.plateNumber,
      details.manualVehicle.make,
      details.manualVehicle.model,
    ].every((v) => typeof v === "string" && v.trim())
  )
    fail("Для машины укажите госномер, марку и модель");
  if (details.orderItems !== undefined) {
    if (!Array.isArray(details.orderItems))
      fail("Укажите работы заказ-наряда списком");
    const ids = new Set<string>();
    for (const work of details.orderItems) {
      if (
        !work ||
        typeof work.id !== "string" ||
        !work.id ||
        ids.has(work.id) ||
        typeof work.description !== "string" ||
        !work.description.trim() ||
        !["painting", "repair"].includes(work.category)
      )
        fail("Для каждой работы укажите название и направление");
      ids.add(work.id);
      const prices =
        work.serviceAmount !== undefined || work.laborAmount !== undefined
          ? [work.serviceAmount, work.laborAmount]
          : [work.amount];
      for (const amount of prices)
        if (
          typeof amount !== "number" ||
          !Number.isFinite(amount) ||
          amount < 0 ||
          Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6
        )
          fail(
            "Для каждой работы укажите корректные стоимость услуги и стоимость работы",
          );
    }
  }
  if (details.expenses !== undefined) {
    if (!Array.isArray(details.expenses)) fail("Расходы должны быть списком");
    const ids = new Set<string>();
    for (const e of details.expenses) {
      if (
        !e ||
        typeof e.id !== "string" ||
        !e.id ||
        ids.has(e.id) ||
        typeof e.description !== "string" ||
        !e.description.trim() ||
        !["sto", "company", "driver"].includes(e.purchaser) ||
        typeof e.amount !== "number" ||
        !Number.isFinite(e.amount) ||
        e.amount < 0 ||
        Math.abs(e.amount * 100 - Math.round(e.amount * 100)) > 1e-6
      )
        fail(
          "Для каждого расхода укажите наименование, стоимость и кто приобрёл",
        );
      ids.add(e.id);
      if (
        e.inventoryMode !== undefined &&
        (!["purchase", "stock"].includes(e.inventoryMode) ||
          e.purchaser !== "company" ||
          (e.inventoryMode === "stock" && !e.partId))
      )
        fail("Для складского расхода GoPark выберите источник и запчасть");
    }
  }
  Object.assign(
    details,
    recalculateServiceCosts(details, previous?.serviceDetails ?? undefined),
  );
  if (details.orderItems !== undefined || details.expenses !== undefined)
    details.costDate ??= new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Almaty",
    }).format(new Date());
  if (
    details.workshop !== undefined &&
    !["body", "main", "both"].includes(details.workshop)
  )
    fail("Выберите кузовной, основной цех или оба цеха");
  if (
    details.accidentFault !== undefined &&
    !["driver", "other", "both", "unknown"].includes(details.accidentFault)
  )
    fail("Укажите виновность водителя");
  if (
    details.expectedPayer !== undefined &&
    !["company", "driver", "insurance"].includes(details.expectedPayer)
  )
    fail("Выберите плательщика");
  if (input.accidentDetails)
    details.accidentFault = input.accidentDetails.fault;
  const stage = merged.serviceStage;
  if (
    stage &&
    ![...stages, "written_off", "writeoff_requested"].includes(stage)
  )
    fail("Неизвестный этап ремонта");
  const changed = stage !== previous?.serviceStage;
  const confirmingArrival =
    input.serviceDetails?.arrivalConfirmed === true &&
    !previous?.serviceDetails?.arrivedAt;
  if (
    input.serviceDetails?.arrivalConfirmed !== undefined &&
    typeof input.serviceDetails.arrivalConfirmed !== "boolean"
  )
    fail("Укажите корректное подтверждение прибытия");
  if (changed && stage === "awaiting_repair")
    fail("Статус ожидания больше не используется. Подтвердите прибытие машины");
  if (confirmingArrival && !previous)
    fail("Прибытие подтверждается после отправки машины на СТО");
  if (
    changed &&
    previous?.serviceStage === "sent_to_service" &&
    stage === "in_repair" &&
    !previous.serviceDetails?.arrivedAt &&
    !confirmingArrival
  )
    fail("Сначала подтвердите прибытие машины на СТО");
  for (const key of ["beforePhoto", "afterPhoto"] as const) {
    const photo = details[key];
    if (
      photo !== undefined &&
      (typeof photo !== "string" ||
        photo.length > 1400000 ||
        !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
          photo,
        ))
    )
      fail("Фото: загрузите JPEG, PNG или WebP размером до 1 МБ");
  }
  if (details.insurance) {
    const insurance = details.insurance;
    if (
      !["gosstrakh", "nsk", "alma"].includes(insurance.insurer) ||
      typeof insurance.paid !== "boolean"
    )
      fail("Укажите страховую компанию и статус оплаты");
    if (insurance.paid) {
      date(insurance.paidAt, "Дата оплаты страховой");
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(insurance.paidAt!) ||
        new Date(insurance.paidAt!).toISOString().slice(0, 10) !==
          insurance.paidAt
      )
        fail("Дата оплаты страховой указана неверно");
      if (Date.parse(insurance.paidAt!) > Date.now())
        fail("Дата оплаты не может быть в будущем");
    } else if (insurance.paidAt)
      fail("Дата оплаты указывается только после оплаты страховой");
  }
  if (
    details.insurance?.confirmedAmount !== undefined &&
    (!Number.isFinite(details.insurance.confirmedAmount) ||
      details.insurance.confirmedAmount < 0 ||
      Math.abs(
        details.insurance.confirmedAmount * 100 -
          Math.round(details.insurance.confirmedAmount * 100),
      ) > 1e-6)
  )
    fail("Подтверждённая сумма страховой указана неверно");
  Object.assign(details, normalizeServicePayments(details));
  if (merged.incidentType === "accident") {
    if (confirmingArrival && !details.beforePhoto)
      fail("При приёмке после ДТП добавьте фото до ремонта");
    const closing =
      !!previous &&
      !["closed", "resolved", "archived"].includes(previous.status) &&
      ["closed", "resolved", "archived"].includes(merged.status ?? "");
    if (
      ((changed && stage === "completed") || closing) &&
      (!details.beforePhoto || !details.afterPhoto)
    )
      fail("Для завершения ДТП нужны фото до и после ремонта");
  }

  if (details.plannedRepairDate !== undefined) {
    date(details.plannedRepairDate, "Плановая дата начала ремонта");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(details.plannedRepairDate) ||
      new Date(details.plannedRepairDate).toISOString().slice(0, 10) !==
        details.plannedRepairDate
    )
      fail("Укажите корректную плановую дату начала ремонта");
  }
  if (confirmingArrival) {
    if (
      typeof details.waitingComment !== "string" ||
      !details.waitingComment.trim()
    )
      fail("При приёмке укажите комментарий СТО");
    if (!details.plannedRepairDate)
      fail("Укажите плановую дату начала ремонта");
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Almaty",
    }).format(new Date());
    if (details.plannedRepairDate! < today)
      fail("Плановая дата начала ремонта не может быть в прошлом");
  }
  if (
    previous?.serviceDetails?.plannedRepairDate &&
    (previous.serviceStage !== "sent_to_service" ||
      !!previous.serviceDetails?.arrivedAt) &&
    input.serviceDetails?.plannedRepairDate !== undefined &&
    input.serviceDetails.plannedRepairDate !==
      previous.serviceDetails.plannedRepairDate
  )
    fail(
      "Зафиксированную плановую дату нельзя менять: она используется для контроля просрочки",
    );
  // Historical records remain readable and are not assigned invented dates.
  if (
    !previous &&
    stage === "sent_to_service" &&
    (typeof details.reason !== "string" || !details.reason.trim())
  )
    fail("Укажите причину отправки на СТО");
  if (previous?.serviceDetails && changed) {
    const from = stages.indexOf(previous.serviceStage ?? "");
    const to = stages.indexOf(stage ?? "");
    if (
      from >= 0 &&
      to >= 0 &&
      to !== from + 1 &&
      !(previous.serviceStage === "sent_to_service" && stage === "in_repair")
    )
      throw new ConflictException(
        "Этапы СТО проходят по порядку: отправлен → ремонт → завершён",
      );
    if (["closed", "archived"].includes(previous.status))
      throw new ConflictException("Завершённый ремонт нельзя повторно открыть");
  }
  if (
    changed &&
    stage === "completed" &&
    previous &&
    previous.serviceStage !== "completed"
  ) {
    if (
      typeof details.orderNumber !== "string" ||
      !details.orderNumber.trim() ||
      !Array.isArray(details.works) ||
      !details.works.some((w) => typeof w === "string" && w.trim())
    )
      fail("Перед завершением укажите номер заказ-наряда и список работ");
  }
  if (
    input.serviceDetails !== undefined ||
    stage === "sent_to_service" ||
    (changed && previous?.serviceDetails)
  ) {
    if (typeof details.reason !== "string" || !details.reason.trim())
      fail("Укажите причину ремонта");
    if (
      details.serviceCost !== undefined &&
      (!Number.isFinite(details.serviceCost) ||
        details.serviceCost < 0 ||
        Math.abs(
          details.serviceCost * 100 - Math.round(details.serviceCost * 100),
        ) > 1e-6)
    )
      fail("Стоимость услуг должна быть неотрицательной");
    if (details.serviceCost !== undefined)
      date(details.costDate, "Дата стоимости услуг");
    if (
      details.paintingCost !== undefined ||
      details.repairCost !== undefined
    ) {
      for (const amount of [details.paintingCost ?? 0, details.repairCost ?? 0])
        if (
          !Number.isFinite(amount) ||
          amount < 0 ||
          Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6
        )
          fail(
            "Стоимость малярных работ и ремонта должна быть неотрицательной, с точностью до копеек",
          );
      if (
        Math.abs(
          (details.paintingCost ?? 0) +
            (details.repairCost ?? 0) -
            (details.serviceBaseCost ?? details.serviceCost ?? 0),
        ) > 0.001
      )
        fail(
          "Стоимость услуг и работ должна равняться сумме малярных работ и ремонта",
        );
    }
    if (
      details.works !== undefined &&
      (!Array.isArray(details.works) ||
        details.works.some((w) => typeof w !== "string"))
    )
      fail("Список работ указан неверно");
    if (details.payments !== undefined && !Array.isArray(details.payments))
      fail("Оплаты указаны неверно");
    const ids = new Set<string>();
    let paid = 0;
    for (const payment of details.payments ?? []) {
      if (
        !payment ||
        typeof payment.id !== "string" ||
        !payment.id ||
        ids.has(payment.id) ||
        !Number.isFinite(payment.amount) ||
        payment.amount <= 0 ||
        Math.abs(payment.amount * 100 - Math.round(payment.amount * 100)) >
          1e-6 ||
        !["company", "driver", "insurance"].includes(payment.payer)
      )
        fail("Для оплаты укажите уникальный номер, сумму и плательщика");
      const historical = previous?.serviceDetails?.payments?.some(
        (p) => p.id === payment.id,
      );
      if (
        payment.payer === "insurance" &&
        (!historical || payment.insurer !== undefined) &&
        !["nsk", "alma", "gosstrakh"].includes(payment.insurer ?? "")
      )
        fail("Для страховой оплаты укажите страховую компанию");
      ids.add(payment.id);
      date(payment.paidAt, "Дата оплаты");
      paid += payment.amount;
    }
    for (const old of previous?.serviceDetails?.payments ?? []) {
      if (
        !details.payments?.some(
          (p) =>
            p.id === old.id &&
            p.amount === old.amount &&
            p.paidAt === old.paidAt &&
            p.payer === old.payer &&
            p.insurer === old.insurer,
        )
      )
        fail("Сохранённую оплату нельзя удалять или изменять");
    }
    if (paid > (details.serviceCost ?? 0) + 0.001)
      fail("Оплата не может превышать стоимость услуг");
    const now = new Date().toISOString();
    for (const key of [
      "sentAt",
      "arrivedAt",
      "repairStartedAt",
      "completedAt",
    ] as const) {
      if (previous?.serviceDetails?.[key])
        details[key] = previous.serviceDetails[key];
      else delete details[key];
    }
    if (changed && stage === "sent_to_service") details.sentAt = now;
    if (confirmingArrival) details.arrivedAt = now;
    if (details.arrivedAt) details.arrivalConfirmed = true;
    if (changed && previous && stage === "in_repair")
      details.repairStartedAt = now;
    if (changed && previous && stage === "completed") details.completedAt = now;
    // Clients cannot rewrite the recorded timestamps of previous stages.
    for (const key of [
      "sentAt",
      "arrivedAt",
      "repairStartedAt",
      "completedAt",
    ] as const) {
      if (previous?.serviceDetails?.[key])
        details[key] = previous.serviceDetails[key];
    }
    return {
      serviceDetails: details,
      servicePaymentStatus:
        paid === 0
          ? "unpaid"
          : paid >= (details.serviceCost ?? Infinity)
            ? "paid"
            : "partial",
    };
  }
  return {};
}
