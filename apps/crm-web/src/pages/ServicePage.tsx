import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type {
  AccidentDetails,
  DriverListItem,
  ManagerIncidentItem,
  ServiceRepairDetails,
  ServicePaymentEntry,
  VehicleListItem,
} from "@gopark/contracts";
import { patchJson, postJson } from "../lib/api";
import { useApiQuery } from "../hooks/useApiQuery";
import { useAuth } from "../ui/AuthContext";
import { downloadCsvTable, formatCurrency, formatDateOnly } from "../lib/utils";
import "./service-workflow.css";
const stages = ["sent_to_service", "awaiting_repair", "in_repair", "completed"];
const labels: Record<string, string> = {
  sent_to_service: "Отправлен на СТО",
  awaiting_repair: "В ожидании",
  in_repair: "В ремонте",
  completed: "Завершён",
  written_off: "Списан",
  writeoff_requested: "Запрошено списание",
  accident: "ДТП",
  inspection: "Осмотр",
  impound: "Штрафстоянка",
};
const insurerLabels = { nsk: "НСК", alma: "Альма", gosstrakh: "Госстрах" };
const payerLabels = {
  company: "GoPark",
  driver: "Водитель",
  insurance: "Страховая компания",
};
function repairReason(
  item: ManagerIncidentItem,
  fallback = "Причина не указана",
) {
  return (
    [item.serviceDetails?.reason, item.repairNote, item.description]
      .find((value) => value?.trim())
      ?.trim() ?? fallback
  );
}
function paid(item: ManagerIncidentItem) {
  return (item.serviceDetails?.payments ?? []).reduce(
    (sum, p) => sum + p.amount,
    0,
  );
}
function cost(item: ManagerIncidentItem) {
  return item.serviceDetails?.serviceCost ?? 0;
}
function closed(item: ManagerIncidentItem) {
  return ["resolved", "closed", "archived"].includes(item.status);
}
// getRandomValues is available on HTTP as well; randomUUID requires HTTPS.
function paymentId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function waitingLate(i: ManagerIncidentItem) {
  const d = i.serviceDetails;
  if (!d?.plannedRepairDate || (!d.repairStartedAt && closed(i))) return false;
  const actual = d.repairStartedAt
    ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(
        new Date(d.repairStartedAt),
      )
    : today();
  return actual > d.plannedRepairDate;
}
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(
    new Date(),
  );
const stamp = (date?: string) =>
  date
    ? new Date(date).toLocaleString("ru-RU", { timeZone: "Asia/Almaty" })
    : "Дата не указана";
export function ServicePage() {
  const { session } = useAuth();
  const incidents = useApiQuery<ManagerIncidentItem[]>("incidents");
  const cars = useApiQuery<VehicleListItem[]>("cars");
  const drivers = useApiQuery<DriverListItem[]>("drivers");
  const canEdit = ["owner", "admin", "finance", "operator"].includes(
    session.requestUserRole,
  );
  const canSend = canEdit || session.requestUserRole === "manager";
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("active");
  const [company, setCompany] = useState(session.companyName || "all");
  const [caseType, setCaseType] = useState("all");
  const [kind, setKind] = useState("all");
  const [managerFilter, setManagerFilter] = useState("");
  const [carFilter, setCarFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [payer, setPayer] = useState("all");
  const detailRef = useRef<HTMLElement>(null);
  const [accidentDraft, setAccidentDraft] = useState<AccidentDetails>({
    location: "",
    occurredAt: "",
    fault: "unknown",
    insurer: "gosstrakh",
    otherPlate: "",
    otherMake: "",
    otherModel: "",
  });
  const [openVersion, setOpenVersion] = useState(0);
  const [selected, setSelected] = useState<ManagerIncidentItem | null>(null);
  useEffect(() => {
    if (selected) {
      detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      detailRef.current?.focus({ preventScroll: true });
    }
  }, [openVersion]);
  const [details, setDetails] = useState<ServiceRepairDetails>({ reason: "" });
  const [payment, setPayment] = useState({
    amount: "",
    paidAt: today(),
    payer: "company" as ServicePaymentEntry["payer"],
  });
  const [message, setMessage] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const savingRef = useRef(false);
  const paymentAttemptRef = useRef<{ key: string; id: string } | null>(null);
  const [sendCar, setSendCar] = useState("");
  const [reason, setReason] = useState("");
  const records = (incidents.data ?? []).filter(
    (i) => i.incidentType === "repair" || stages.includes(i.serviceStage ?? ""),
  );
  const carById = new Map((cars.data ?? []).map((c) => [c.id, c]));
  const driverById = new Map((drivers.data ?? []).map((d) => [d.id, d]));
  const vehicleLabel = (i: ManagerIncidentItem) =>
    i.carId ? (carById.get(i.carId)?.plateNumber ?? i.title) : i.title;
  const periodRecords = records.filter((i) => {
    const day = (i.serviceDetails?.costDate ?? i.occurredAt ?? "").slice(0, 10);
    const companyName =
      (i.carId ? carById.get(i.carId)?.companyName : null) ??
      (i.driverId ? driverById.get(i.driverId)?.companyName : null);
    return (
      (company === "all" || companyName === company) &&
      (!carFilter || i.carId === carFilter) &&
      (caseType === "all" || i.serviceCaseType === caseType) &&
      (kind === "all" ||
        (kind === "accident"
          ? i.incidentType === "accident"
          : i.incidentType !== "accident")) &&
      (!managerFilter ||
        (i.managerLabel ??
          (i.carId ? carById.get(i.carId)?.managerName : null)) ===
          managerFilter) &&
      (!from || day >= from) &&
      (!to || (!!day && day <= to)) &&
      (payer === "all" ||
        (i.serviceDetails?.payments ?? []).some((p) => p.payer === payer))
    );
  });
  const rows = periodRecords.filter(
    (i) =>
      (filter === "all" ||
        (filter === "active" && !closed(i)) ||
        (filter === "archived" && closed(i)) ||
        (filter === "overdue_start" && waitingLate(i)) ||
        i.serviceStage === filter) &&
      [
        vehicleLabel(i),
        i.title,
        i.description,
        i.serviceDetails?.reason,
        i.driverId ? driverById.get(i.driverId)?.fullName : "",
        i.managerLabel,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const untracked = (cars.data ?? []).filter(
    (c) =>
      (company === "all" || c.companyName === company) &&
      (!carFilter || c.id === carFilter) &&
      caseType === "all" &&
      kind !== "accident" &&
      payer === "all" &&
      (!managerFilter || c.managerName === managerFilter) &&
      c.status === "maintenance" &&
      !records.some((i) => i.carId === c.id && !closed(i)) &&
      ["active", "all", "in_repair"].includes(filter) &&
      [c.plateNumber, c.make, c.model]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const sums = useMemo(
    () =>
      periodRecords.reduce(
        (s, i) => ({ cost: s.cost + cost(i), paid: s.paid + paid(i) }),
        { cost: 0, paid: 0 },
      ),
    [periodRecords],
  );
  const receipts = records
    .filter((i) => {
      const name =
        (i.carId ? carById.get(i.carId)?.companyName : null) ??
        (i.driverId ? driverById.get(i.driverId)?.companyName : null);
      return (
        (company === "all" || name === company) &&
        (!carFilter || i.carId === carFilter) &&
        (caseType === "all" || i.serviceCaseType === caseType) &&
        (kind === "all" ||
          (kind === "accident"
            ? i.incidentType === "accident"
            : i.incidentType !== "accident")) &&
        (!managerFilter ||
          (i.managerLabel ?? carById.get(i.carId ?? "")?.managerName) ===
            managerFilter)
      );
    })
    .flatMap((i) => i.serviceDetails?.payments ?? [])
    .filter(
      (p) =>
        (payer === "all" || p.payer === payer) &&
        (!from || p.paidAt.slice(0, 10) >= from) &&
        (!to || p.paidAt.slice(0, 10) <= to),
    )
    .reduce((sum, p) => sum + p.amount, 0);
  async function refresh() {
    await Promise.all([incidents.refetch(), cars.refetch(), drivers.refetch()]);
  }
  function open(i: ManagerIncidentItem) {
    setSelected(i);
    paymentAttemptRef.current = null;
    setOpenVersion((v) => v + 1);
    setAccidentDraft(
      i.accidentDetails ?? {
        location: "",
        occurredAt: i.occurredAt ?? "",
        fault: "unknown",
        insurer: "gosstrakh",
        otherPlate: "",
        otherMake: "",
        otherModel: "",
      },
    );
    setPayment({ amount: "", paidAt: today(), payer: "company" });
    setDetails({ ...i.serviceDetails, reason: repairReason(i, "") });
    setMessage("");
  }
  async function save(stage?: string, draft = details, includeAccident = true) {
    if (!selected || busy || savingRef.current) return false;
    savingRef.current = true;
    setBusy(true);
    setMessage("");
    try {
      const next = await patchJson<ManagerIncidentItem, unknown>(
        `incidents/${selected.id}`,
        {
          serviceDetails: draft,
          ...(includeAccident && selected.incidentType === "accident"
            ? { accidentDetails: accidentDraft }
            : {}),
          ...(stage
            ? {
                serviceStage: stage,
                status: stage === "completed" ? "closed" : "open",
              }
            : {}),
          repairNote: draft.reason,
        },
      );
      setSelected(next);
      setDetails(next.serviceDetails ?? draft);
      await Promise.allSettled([
        incidents.refetch({ silent: true }),
        cars.refetch({ silent: true }),
        drivers.refetch({ silent: true }),
      ]);
      setMessage(
        stage === "completed"
          ? "Ремонт завершён. Бригадир получит уведомление."
          : "Данные сохранены. Бригадир получит уведомление.",
      );
      return true;
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Не удалось сохранить ремонт",
      );
      return false;
    } finally {
      savingRef.current = false;
      setBusy(false);
    }
  }
  async function send() {
    if (!sendCar || !reason.trim() || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const car = carById.get(sendCar)!;
      const existing = records.find((i) => i.carId === car.id && !closed(i));
      if (existing)
        throw new Error(
          "У машины уже есть открытый ремонт. Откройте его карточку.",
        );
      const legacy = car.status === "maintenance";
      const accident = (incidents.data ?? []).find(
        (i) =>
          i.carId === car.id && i.incidentType === "accident" && !closed(i),
      );
      const result = accident
        ? await patchJson<ManagerIncidentItem, unknown>(
            `incidents/${accident.id}`,
            {
              serviceStage: "sent_to_service",
              serviceDetails: { reason: reason.trim() },
              repairNote: reason.trim(),
            },
          )
        : await postJson<ManagerIncidentItem, unknown>("incidents", {
            title: `Ремонт: ${car.plateNumber}`,
            incidentType: "repair",
            status: "open",
            priority: "high",
            carId: car.id,
            driverId: car.assignedDriverId ?? null,
            description: reason.trim(),
            repairNote: reason.trim(),
            serviceStage: legacy ? "in_repair" : "sent_to_service",
            serviceDetails: { reason: reason.trim() },
            occurredAt: legacy ? null : new Date().toISOString(),
            managerLabel: car.managerName ?? null,
          });
      setSendCar("");
      setReason("");
      await refresh();
      open(result);
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Не удалось отправить машину",
      );
    } finally {
      setBusy(false);
    }
  }
  async function addPayment() {
    if (busy || savingRef.current || !selected) return;
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Укажите сумму оплаты больше нуля");
      return;
    }
    if (
      payment.payer === "insurance" &&
      (!details.insurance?.insurer ||
        !details.insurance.paid ||
        !details.insurance.paidAt)
    ) {
      setMessage("Выберите страховую, отметьте оплату и укажите дату");
      return;
    }
    if (
      details.serviceCost === undefined ||
      amount + paid({ ...selected, serviceDetails: details }) >
        details.serviceCost + 0.001
    ) {
      setMessage(
        "Укажите стоимость услуг. Сумма оплат не должна превышать её.",
      );
      return;
    }
    const attemptKey = JSON.stringify([
      selected.id,
      payment,
      details.insurance?.insurer,
    ]);
    if (paymentAttemptRef.current?.key !== attemptKey)
      paymentAttemptRef.current = { key: attemptKey, id: paymentId() };
    const draft: ServiceRepairDetails = {
      ...details,
      payments: [
        ...(details.payments ?? []),
        {
          id: paymentAttemptRef.current.id,
          amount,
          paidAt: payment.paidAt,
          payer: payment.payer,
          ...(payment.payer === "insurance"
            ? { insurer: details.insurance!.insurer }
            : {}),
        },
      ],
    };
    if (await save(undefined, draft, false)) {
      paymentAttemptRef.current = null;
      setPayment({ ...payment, amount: "" });
      setMessage("Оплата сохранена. Оплаченная сумма и остаток обновлены.");
    }
  }
  async function loadPhoto(
    file: File | undefined,
    key: "beforePhoto" | "afterPhoto",
  ) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 1024 * 1024
    ) {
      setMessage("Выберите JPEG, PNG или WebP до 1 МБ");
      return;
    }
    try {
      const photo = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      setDetails((current) => ({ ...current, [key]: photo }));
    } catch {
      setMessage("Не удалось прочитать фотографию");
    }
  }
  const accidents = (incidents.data ?? []).filter(
    (i) =>
      i.incidentType === "accident" &&
      (company === "all" ||
        (i.carId
          ? carById.get(i.carId)?.companyName
          : driverById.get(i.driverId ?? "")?.companyName) === company) &&
      (!from ||
        (i.accidentDetails?.occurredAt ?? i.occurredAt ?? "").slice(0, 10) >=
          from) &&
      (!to ||
        (!!(i.accidentDetails?.occurredAt ?? i.occurredAt) &&
          (i.accidentDetails?.occurredAt ?? i.occurredAt ?? "").slice(0, 10) <=
            to)),
  );
  const guilty = accidents.filter((i) =>
    ["driver", "both"].includes(i.accidentDetails?.fault ?? ""),
  ).length;
  const innocent = accidents.filter(
    (i) => i.accidentDetails?.fault === "other",
  ).length;
  const knownFault = guilty + innocent;
  const percent = (n: number) =>
    knownFault ? `${((n / knownFault) * 100).toFixed(1)}%` : "—";
  async function exportExcel() {
    if (from && to && from > to) {
      setMessage("Дата «с» должна быть не позже даты «по»");
      return;
    }
    try {
      const x = await import("xlsx");
      const book = x.utils.book_new();
      const cases = [
        [
          "Автомобиль",
          "Водитель",
          "Бригадир",
          "Тип",
          "Этап",
          "Причина",
          "Стоимость услуг",
          "Оплачено всего",
          "К оплате",
          "Оплата",
          "Плательщики",
          "Дата стоимости",
          "План начала ремонта",
          "Начало фактически",
          "Нарушен срок",
        ],
        ...rows.map((i) => [
          vehicleLabel(i),
          driverById.get(i.driverId ?? "")?.fullName ?? "",
          i.managerLabel ?? "",
          i.incidentType === "accident" ? "ДТП" : "Ремонт",
          labels[i.serviceStage ?? ""] ?? i.status,
          i.serviceDetails?.reason ?? "",
          i.serviceDetails?.serviceCost ?? "",
          paid(i),
          i.serviceDetails?.serviceCost == null
            ? "Стоимость не указана"
            : Math.max(0, cost(i) - paid(i)),
          !paid(i)
            ? "Не оплачено"
            : paid(i) >= cost(i)
              ? "Оплачено"
              : "Частично",
          (i.serviceDetails?.payments ?? [])
            .map(
              (p) =>
                payerLabels[p.payer] +
                (p.insurer ? ` · ${insurerLabels[p.insurer]}` : ""),
            )
            .join("; "),
          i.serviceDetails?.costDate ?? "",
          i.serviceDetails?.plannedRepairDate ?? "",
          i.serviceDetails?.repairStartedAt ?? "",
          waitingLate(i) ? "Да" : "Нет",
        ]),
      ];
      const cash: Array<Array<string | number>> = [
        [
          "Автомобиль",
          "Водитель",
          "Бригадир",
          "Плательщик",
          "Страховая",
          "Дата оплаты",
          "Сумма",
          "Номер оплаты",
        ],
      ];
      for (const i of records) {
        const name =
          (i.carId ? carById.get(i.carId)?.companyName : null) ??
          driverById.get(i.driverId ?? "")?.companyName;
        if (
          (company !== "all" && company !== name) ||
          (carFilter && i.carId !== carFilter) ||
          (managerFilter &&
            (i.managerLabel ?? carById.get(i.carId ?? "")?.managerName) !==
              managerFilter) ||
          (kind !== "all" &&
            (kind === "accident") !== (i.incidentType === "accident")) ||
          (caseType !== "all" && i.serviceCaseType !== caseType)
        )
          continue;
        for (const p of i.serviceDetails?.payments ?? [])
          if (
            (!from || p.paidAt.slice(0, 10) >= from) &&
            (!to || p.paidAt.slice(0, 10) <= to) &&
            (payer === "all" || p.payer === payer)
          )
            cash.push([
              vehicleLabel(i),
              driverById.get(i.driverId ?? "")?.fullName ?? "",
              i.managerLabel ?? "",
              payerLabels[p.payer],
              p.insurer ? insurerLabels[p.insurer] : "",
              p.paidAt,
              p.amount,
              p.id,
            ]);
      }
      x.utils.book_append_sheet(
        book,
        x.utils.aoa_to_sheet(cases),
        "Ремонты и задолженность",
      );
      x.utils.book_append_sheet(
        book,
        x.utils.aoa_to_sheet(cash),
        "Поступления за период",
      );
      x.utils.book_append_sheet(
        book,
        x.utils.aoa_to_sheet([
          ["Период с", from || "Все даты"],
          ["Период по", to || "Все даты"],
          ["Стоимость услуг", rows.reduce((sum, i) => sum + cost(i), 0)],
          ["Оплачено по ремонтам", rows.reduce((sum, i) => sum + paid(i), 0)],
          [
            "К оплате",
            rows.reduce((sum, i) => sum + Math.max(0, cost(i) - paid(i)), 0),
          ],
          ["Прибыль СТО 30%", rows.reduce((sum, i) => sum + cost(i) * 0.3, 0)],
          [
            "Пояснение",
            "Ремонты отобраны по дате стоимости; поступления — по дате оплаты. Пустая стоимость не равна нулевому обязательству.",
          ],
        ]),
        "Итоги",
      );
      x.writeFile(book, `gopark-sto-${from || "all"}-${to || "all"}.xlsx`);
    } catch {
      setMessage("Не удалось подготовить Excel. Повторите выгрузку.");
    }
  }
  const error = incidents.error || cars.error || drivers.error;
  return (
    <section className="page-stack service-page">
      {photoPreview && (
        <button
          type="button"
          className="photo-lightbox"
          aria-label="Закрыть фото"
          onClick={() => setPhotoPreview(null)}
        >
          <img src={photoPreview} alt="Фото ремонта" />
        </button>
      )}
      {!selected && (
        <>
          <div className="hero-card hero-card--dashboard">
            <div className="hero-card__main">
              <p className="eyebrow">Ремонт и услуги</p>
              <h2>СТО</h2>
              <p>
                Причина, этапы ремонта, заказ-наряд и оплата в одной карточке.
              </p>
            </div>
            <div className="hero-card__actions">
              <button
                className="button button--secondary"
                onClick={() => void exportExcel()}
              >
                Скачать Excel
              </button>
              <Link className="button button--secondary" to="/incidents">
                Инциденты
              </Link>
              <button
                className="button button--secondary"
                onClick={() =>
                  downloadCsvTable(
                    "gopark-service.csv",
                    [
                      "Автомобиль",
                      "Статус",
                      "Причина",
                      "Отправлен",
                      "Прибыл",
                      "Начало ремонта",
                      "Завершён",
                      "Заказ-наряд",
                      "Работы",
                      "Стоимость услуг",
                      "Дата стоимости",
                      "Оплачено",
                      "Остаток",
                      "Прибыль СТО",
                      "Оплаты с датами и плательщиками",
                    ],
                    rows.map((i) => [
                      vehicleLabel(i),
                      labels[i.serviceStage ?? ""] ?? i.status,
                      i.serviceDetails?.reason ?? i.repairNote ?? "",
                      i.serviceDetails?.sentAt ?? "",
                      i.serviceDetails?.arrivedAt ?? "",
                      i.serviceDetails?.repairStartedAt ?? "",
                      i.serviceDetails?.completedAt ?? "",
                      i.serviceDetails?.orderNumber ?? "",
                      i.serviceDetails?.works?.join("; ") ?? "",
                      i.serviceDetails?.serviceCost ?? "",
                      i.serviceDetails?.costDate ?? "",
                      paid(i),
                      Math.max(0, cost(i) - paid(i)),
                      cost(i) * 0.3,
                      JSON.stringify(i.serviceDetails?.payments ?? []),
                    ]),
                  )
                }
              >
                Скачать CSV
              </button>
            </div>
          </div>
          <div className="sto-stats">
            {[
              [
                "Автомобили в ремонте",
                String(
                  (cars.data ?? []).filter(
                    (c) =>
                      c.status === "maintenance" &&
                      (company === "all" || c.companyName === company),
                  ).length,
                ),
              ],
              ["Стоимость услуг", formatCurrency(sums.cost)],
              ["Оплачено", formatCurrency(sums.paid)],
              [
                "Не оплачено",
                formatCurrency(Math.max(0, sums.cost - sums.paid)),
              ],
              ["Прибыль СТО · 30%", formatCurrency(sums.cost * 0.3)],
            ].map(([label, value]) => (
              <div className="sto-stat" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <div className="sto-stats" aria-label="Статистика ДТП">
            {[
              ["Всего ДТП", String(accidents.length)],
              [
                "Водитель виновен · включая обоюдную",
                `${guilty} · ${percent(guilty)}`,
              ],
              ["Водитель не виновен", `${innocent} · ${percent(innocent)}`],
              [
                "Виновность не установлена",
                String(accidents.length - knownFault),
              ],
              [
                "Стоимость ДТП",
                formatCurrency(
                  accidents.reduce(
                    (sum, i) =>
                      sum + (i.serviceDetails?.serviceCost ?? i.amount ?? 0),
                    0,
                  ),
                ),
              ],
            ].map(([label, value]) => (
              <div className="sto-stat" key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
          <p className="muted">
            ДТП — за период по дате происшествия. Проценты — среди случаев с
            установленной виновностью. Стоимость: услуги, а для старых записей —
            исторический расход; без суммы:{" "}
            {
              accidents.filter(
                (i) =>
                  i.serviceDetails?.serviceCost == null && i.amount == null,
              ).length
            }
            .
          </p>
          <div className="panel sto-filters">
            <label>
              Компания
              <select
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              >
                <option value="all">Все компании</option>
                {[
                  ...new Set(
                    (cars.data ?? []).map((c) => c.companyName).filter(Boolean),
                  ),
                ].map((c) => (
                  <option key={c!} value={c!}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Тип обращения
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="all">Ремонт и ДТП</option>
                <option value="repair">Только ремонт</option>
                <option value="accident">После ДТП</option>
              </select>
            </label>
            <label>
              Случай
              <select
                value={caseType}
                onChange={(e) => setCaseType(e.target.value)}
              >
                <option value="all">Все случаи</option>
                <option value="insurance">Страховой</option>
                <option value="non_insurance">Нестраховой</option>
              </select>
            </label>
            <label>
              Бригадир
              <select
                aria-label="Бригадир"
                value={managerFilter}
                onChange={(e) => setManagerFilter(e.target.value)}
              >
                <option value="">Все бригадиры</option>
                {[
                  ...new Set(
                    [
                      ...records.map((i) => i.managerLabel),
                      ...(cars.data ?? [])
                        .filter((c) => c.status === "maintenance")
                        .map((c) => c.managerName),
                    ].filter((v): v is string => !!v),
                  ),
                ]
                  .sort()
                  .map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Машина в СТО
              <select
                aria-label="Машина в СТО"
                value={carFilter}
                onChange={(e) => setCarFilter(e.target.value)}
              >
                <option value="">Все машины</option>
                {(cars.data ?? [])
                  .filter(
                    (c) =>
                      c.status === "maintenance" ||
                      records.some(
                        (i) =>
                          i.carId === c.id &&
                          (!closed(i) ||
                            filter === "archived" ||
                            filter === "all"),
                      ) ||
                      c.id === carFilter,
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.plateNumber} · {c.make} {c.model}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Поиск
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Машина, водитель, причина"
              />
            </label>
            <label>
              Статус
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="active">Активные ремонты</option>
                <option value="all">Все ремонты</option>
                <option value="overdue_start">
                  Нарушен срок начала ремонта
                </option>
                {stages.slice(0, 3).map((s) => (
                  <option key={s} value={s}>
                    {labels[s]}
                  </option>
                ))}
                <option value="archived">Завершённые / архив</option>
              </select>
            </label>
            <label>
              Плательщик
              <select value={payer} onChange={(e) => setPayer(e.target.value)}>
                <option value="all">Все плательщики</option>
                {Object.entries(payerLabels).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Стоимость услуг с
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              По
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <p className="muted sto-wide">
              Записей без указанной стоимости услуг:{" "}
              {
                periodRecords.filter(
                  (i) => i.serviceDetails?.serviceCost === undefined,
                ).length
              }
              . Исторические расходы не включаются в прибыль без стоимости
              услуг.
              <br />
              Прибыль начисленная: {formatCurrency(sums.cost * 0.3)} ·
              полученная: {formatCurrency(sums.paid * 0.3)} · ожидаемая:{" "}
              {formatCurrency(Math.max(0, sums.cost - sums.paid) * 0.3)}. Период
              применяется к дате стоимости услуг; для старых записей — к дате
              инцидента.
              <br />
              Поступило по датам оплаты за выбранный период:{" "}
              {formatCurrency(receipts)} · прибыль с поступлений:{" "}
              {formatCurrency(receipts * 0.3)}.
            </p>
          </div>
          {error && (
            <div role="alert" className="panel">
              Не удалось загрузить журнал.{" "}
              <button onClick={() => void refresh()}>Повторить</button>
            </div>
          )}
          {incidents.loading && <div className="panel">Загрузка ремонтов…</div>}
          {message && (
            <div role="status" className="panel">
              {message}
            </div>
          )}
          <div className="sto-cards">
            {rows.map((i) => (
              <article className="sto-card" key={i.id}>
                <div className="sto-card-heading">
                  <h3>
                    {vehicleLabel(i)}{" "}
                    <small
                      className={
                        i.incidentType === "accident"
                          ? "sto-kind sto-kind--accident"
                          : "sto-kind"
                      }
                    >
                      {i.incidentType === "accident" ? "После ДТП" : "Ремонт"}
                    </small>
                  </h3>
                  <span
                    className={`sto-badge ${closed(i) ? "sto-badge--done" : ""}`}
                  >
                    {labels[i.serviceStage ?? ""] ?? i.status}
                  </span>
                </div>
                <p className="muted">
                  {i.driverId
                    ? (driverById.get(i.driverId)?.fullName ??
                      "Водитель не указан")
                    : "Без водителя"}{" "}
                  · {i.managerLabel ?? "Бригадир не указан"}
                </p>
                <div className="sto-reason" title={repairReason(i)}>
                  <strong>Причина: </strong>
                  {repairReason(i)}
                </div>
                {waitingLate(i) && (
                  <span className="sto-late">
                    {i.serviceDetails?.repairStartedAt
                      ? "Начат с опозданием"
                      : "Начало ремонта просрочено"}
                  </span>
                )}
                <button
                  className="button button--secondary"
                  onClick={() => open(i)}
                >
                  Открыть карточку
                </button>
              </article>
            ))}
            {untracked.map((c) => (
              <article className="sto-card" key={c.id}>
                <div className="sto-card-heading">
                  <h3>{c.plateNumber}</h3>
                  <span className="sto-badge">В ремонте</span>
                </div>
                <p>
                  {c.make} {c.model}
                </p>
                <div className="sto-reason">
                  <strong>Причина: </strong>
                  {c.incidentComment?.trim() || "Не указана в журнале"}
                </div>
                <p className="muted">
                  Открытый кейс не найден. Укажите причину, заказ-наряд и работы
                  перед завершением.
                </p>
                {canEdit && (
                  <button
                    className="button button--secondary"
                    onClick={() => {
                      setSendCar(c.id);
                      setReason("");
                    }}
                  >
                    Оформить ремонт
                  </button>
                )}
              </article>
            ))}
          </div>
          {!rows.length &&
            !untracked.length &&
            !incidents.loading &&
            !error && <div className="panel">Ремонтов по фильтру нет.</div>}
          {canSend && (
            <section className="panel">
              <h3>
                {carById.get(sendCar)?.status === "maintenance"
                  ? "Оформить текущий ремонт"
                  : "Отправить на СТО"}
              </h3>
              <div className="sto-filters">
                <label>
                  Автомобиль
                  <select
                    value={sendCar}
                    onChange={(e) => setSendCar(e.target.value)}
                  >
                    <option value="">Выберите автомобиль</option>
                    {(cars.data ?? [])
                      .filter(
                        (c) => !["sold", "written_off"].includes(c.status),
                      )
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.plateNumber} · {c.make} {c.model}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="sto-wide">
                  Причина *
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Что произошло и что требуется проверить"
                  />
                </label>
              </div>
              <p className="muted">
                Если СТО не подтвердит прибытие за 24 часа, бригадир получит
                уведомление.
              </p>
              <button
                className="button"
                disabled={busy || !sendCar || !reason.trim()}
                onClick={() => void send()}
              >
                {busy ? "Сохранение…" : "Сохранить и уведомить"}
              </button>
            </section>
          )}
        </>
      )}
      {selected && message && (
        <div role="status" className="panel">
          {message}
        </div>
      )}
      {selected && (
        <section
          ref={detailRef}
          tabIndex={-1}
          className="panel sto-detail"
          aria-label="Карточка ремонта"
        >
          <div className="sto-card-heading">
            <h3>Карточка ремонта · {vehicleLabel(selected)}</h3>
            <button
              className="button button--secondary"
              onClick={() => setSelected(null)}
            >
              Закрыть карточку
            </button>
          </div>
          <section
            className="sto-overview"
            aria-label="Подробная информация о ремонте"
          >
            <h4>Информация о машине и ремонте</h4>
            <dl>
              <div>
                <dt>Автомобиль</dt>
                <dd>
                  {[
                    vehicleLabel(selected),
                    carById.get(selected.carId ?? "")?.make,
                    carById.get(selected.carId ?? "")?.model,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </dd>
              </div>
              <div>
                <dt>Водитель</dt>
                <dd>
                  {driverById.get(selected.driverId ?? "")?.fullName ??
                    selected.driverName ??
                    "Не указан"}
                </dd>
              </div>
              <div>
                <dt>Бригадир</dt>
                <dd>
                  {selected.managerLabel ??
                    carById.get(selected.carId ?? "")?.managerName ??
                    "Не указан"}
                </dd>
              </div>
              <div>
                <dt>Тип и этап</dt>
                <dd>
                  {selected.incidentType === "accident"
                    ? "После ДТП"
                    : "Ремонт"}{" "}
                  · {labels[selected.serviceStage ?? ""] ?? selected.status}
                </dd>
              </div>
              <div className="sto-overview-wide">
                <dt>Причина ремонта</dt>
                <dd>{repairReason(selected)}</dd>
              </div>
              {selected.description?.trim() &&
                selected.description.trim() !== repairReason(selected) && (
                  <div className="sto-overview-wide">
                    <dt>Описание инцидента</dt>
                    <dd>{selected.description}</dd>
                  </div>
                )}
              {selected.locationNote && (
                <div>
                  <dt>Место</dt>
                  <dd>{selected.locationNote}</dd>
                </div>
              )}
              {selected.occurredAt && (
                <div>
                  <dt>Дата инцидента</dt>
                  <dd>{stamp(selected.occurredAt)}</dd>
                </div>
              )}
              {selected.accidentDetails && (
                <>
                  <div>
                    <dt>Место ДТП</dt>
                    <dd>{selected.accidentDetails.location}</dd>
                  </div>
                  <div>
                    <dt>Дата ДТП</dt>
                    <dd>{stamp(selected.accidentDetails.occurredAt)}</dd>
                  </div>
                  <div>
                    <dt>Виновность водителя</dt>
                    <dd>
                      {
                        {
                          driver: "Виновен",
                          other: "Не виновен",
                          both: "Обоюдная вина",
                          unknown: "Не установлена",
                        }[selected.accidentDetails.fault]
                      }
                    </dd>
                  </div>
                  <div>
                    <dt>Страховая ДТП</dt>
                    <dd>{insurerLabels[selected.accidentDetails.insurer]}</dd>
                  </div>
                  <div>
                    <dt>Второй участник</dt>
                    <dd>
                      {[
                        selected.accidentDetails.otherPlate,
                        selected.accidentDetails.otherMake,
                        selected.accidentDetails.otherModel,
                      ].join(" · ")}
                    </dd>
                  </div>
                </>
              )}
              {selected.referenceNumber && (
                <div>
                  <dt>Номер инцидента</dt>
                  <dd>{selected.referenceNumber}</dd>
                </div>
              )}
              {selected.periodLabel && (
                <div>
                  <dt>Период инцидента</dt>
                  <dd>{selected.periodLabel}</dd>
                </div>
              )}
              {selected.amount != null && (
                <div>
                  <dt>Исторический расход</dt>
                  <dd>{formatCurrency(selected.amount)}</dd>
                </div>
              )}
              {selected.insuranceCompensationAmount != null && (
                <div>
                  <dt>Страховое возмещение</dt>
                  <dd>
                    {formatCurrency(selected.insuranceCompensationAmount)}
                  </dd>
                </div>
              )}
              {selected.writeoffAmount != null && (
                <div>
                  <dt>Сумма списания</dt>
                  <dd>{formatCurrency(selected.writeoffAmount)}</dd>
                </div>
              )}
              {selected.insuranceNote && (
                <div className="sto-overview-wide">
                  <dt>Примечание по страхованию</dt>
                  <dd>{selected.insuranceNote}</dd>
                </div>
              )}
            </dl>
          </section>
          <div className="sto-timeline">
            {stages.map((s, n) => (
              <div
                key={s}
                className={
                  stages.indexOf(selected.serviceStage ?? "") >= n
                    ? "sto-step--done"
                    : ""
                }
              >
                <b>{labels[s]}</b>
                <span>
                  {stamp(
                    selected.serviceDetails?.[
                      (
                        [
                          "sentAt",
                          "arrivedAt",
                          "repairStartedAt",
                          "completedAt",
                        ] as const
                      )[n]
                    ],
                  )}
                </span>
              </div>
            ))}
          </div>
          {!!selected.statusHistory?.length && (
            <details className="sto-history">
              <summary>
                История всех этапов · {selected.statusHistory.length}
              </summary>
              <ol>
                {selected.statusHistory.map((entry, index) => (
                  <li key={index}>
                    {stamp(entry.changedAt)} ·{" "}
                    {labels[entry.serviceStage ?? ""] ??
                      entry.serviceStage ??
                      entry.status}{" "}
                    ·{" "}
                    {(
                      {
                        open: "Открыт",
                        closed: "Закрыт",
                        resolved: "Завершён",
                        archived: "Архив",
                      } as Record<string, string>
                    )[entry.status] ?? entry.status}
                  </li>
                ))}
              </ol>
            </details>
          )}
          {selected.serviceDetails?.plannedRepairDate && (
            <p className={waitingLate(selected) ? "sto-late" : "muted"}>
              План начала ремонта:{" "}
              {formatDateOnly(selected.serviceDetails.plannedRepairDate)} ·{" "}
              {waitingLate(selected) ? "Срок нарушен" : "Срок не нарушен"}
              <br />
              Комментарий СТО: {selected.serviceDetails.waitingComment ?? "—"}
            </p>
          )}
          <fieldset disabled={!canEdit || busy}>
            {(selected.serviceStage === "sent_to_service" ||
              details.plannedRepairDate) && (
              <div className="sto-filters">
                <label>
                  Комментарий ожидания *
                  <textarea
                    value={details.waitingComment ?? ""}
                    onChange={(e) =>
                      setDetails({ ...details, waitingComment: e.target.value })
                    }
                  />
                </label>
                <label>
                  Плановая дата начала ремонта *
                  <input
                    type="date"
                    min={today()}
                    disabled={
                      !!selected.serviceDetails?.plannedRepairDate &&
                      selected.serviceStage !== "sent_to_service"
                    }
                    value={details.plannedRepairDate ?? ""}
                    onChange={(e) =>
                      setDetails({
                        ...details,
                        plannedRepairDate: e.target.value || undefined,
                      })
                    }
                  />
                </label>
              </div>
            )}
            {selected.incidentType === "accident" && (
              <div className="sto-filters">
                <label>
                  Виновность водителя
                  <select
                    value={accidentDraft.fault}
                    onChange={(e) =>
                      setAccidentDraft({
                        ...accidentDraft,
                        fault: e.target.value as AccidentDetails["fault"],
                      })
                    }
                  >
                    <option value="unknown">Не установлена</option>
                    <option value="driver">Виновен</option>
                    <option value="other">Не виновен</option>
                    <option value="both">Обоюдная вина</option>
                  </select>
                </label>
                {!selected.accidentDetails && (
                  <>
                    {(
                      [
                        ["location", "Место ДТП"],
                        ["otherPlate", "Госномер второго участника"],
                        ["otherMake", "Марка второго участника"],
                        ["otherModel", "Модель второго участника"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key}>
                        {label} *
                        <input
                          value={accidentDraft[key]}
                          onChange={(e) =>
                            setAccidentDraft({
                              ...accidentDraft,
                              [key]: e.target.value,
                            })
                          }
                        />
                      </label>
                    ))}
                    <label>
                      Дата и время ДТП *
                      <input
                        type="datetime-local"
                        value={
                          accidentDraft.occurredAt
                            ? accidentDraft.occurredAt.slice(0, 16)
                            : ""
                        }
                        onChange={(e) =>
                          setAccidentDraft({
                            ...accidentDraft,
                            occurredAt: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Страховая ДТП
                      <select
                        value={accidentDraft.insurer}
                        onChange={(e) =>
                          setAccidentDraft({
                            ...accidentDraft,
                            insurer: e.target
                              .value as AccidentDetails["insurer"],
                          })
                        }
                      >
                        {Object.entries(insurerLabels).map(([v, l]) => (
                          <option key={v} value={v}>
                            {l}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                )}
                {(["beforePhoto", "afterPhoto"] as const).map((key) => (
                  <label key={key}>
                    {key === "beforePhoto"
                      ? "Фото до ремонта · при приёмке *"
                      : "Фото после ремонта · при завершении *"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(e) => void loadPhoto(e.target.files?.[0], key)}
                    />
                    {details[key] && (
                      <a
                        href="#photo"
                        onClick={(e) => {
                          e.preventDefault();
                          setPhotoPreview(details[key] ?? null);
                        }}
                      >
                        <img
                          className="sto-photo"
                          src={details[key]}
                          alt={
                            key === "beforePhoto"
                              ? "До ремонта"
                              : "После ремонта"
                          }
                        />
                      </a>
                    )}
                  </label>
                ))}
              </div>
            )}
            <div className="sto-filters">
              <label className="sto-wide">
                Причина *
                <textarea
                  value={details.reason}
                  onChange={(e) =>
                    setDetails({ ...details, reason: e.target.value })
                  }
                />
              </label>
              <label>
                Номер заказ-наряда *
                <input
                  value={details.orderNumber ?? ""}
                  onChange={(e) =>
                    setDetails({ ...details, orderNumber: e.target.value })
                  }
                />
              </label>
              <label>
                Стоимость услуг, сом
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={details.serviceCost ?? ""}
                  onChange={(e) =>
                    setDetails({
                      ...details,
                      serviceCost:
                        e.target.value === ""
                          ? undefined
                          : Number(e.target.value),
                      costDate: details.costDate ?? today(),
                    })
                  }
                />
              </label>
              <label>
                Дата стоимости услуг
                <input
                  type="date"
                  value={details.costDate ?? ""}
                  onChange={(e) =>
                    setDetails({ ...details, costDate: e.target.value })
                  }
                />
              </label>
              <label className="sto-wide">
                Список выполненных работ *
                <textarea
                  value={(details.works ?? []).join("\n")}
                  placeholder="Каждая работа с новой строки"
                  onChange={(e) =>
                    setDetails({
                      ...details,
                      works: e.target.value.split("\n"),
                    })
                  }
                />
              </label>
            </div>
            {selected.amount != null &&
              selected.serviceDetails?.serviceCost === undefined && (
                <p className="muted">
                  Исторический расход: {formatCurrency(selected.amount)} ·
                  страховое возмещение:{" "}
                  {formatCurrency(selected.insuranceCompensationAmount ?? 0)}.
                  Эти суммы сохранены отдельно от стоимости услуг.
                </p>
              )}
            <h4>Оплаты</h4>
            <p role="status">
              Оплачено:{" "}
              {formatCurrency(paid({ ...selected, serviceDetails: details }))} ·
              Остаток:{" "}
              {formatCurrency(
                Math.max(
                  0,
                  (details.serviceCost ?? 0) -
                    paid({ ...selected, serviceDetails: details }),
                ),
              )}
            </p>
            {(payment.payer === "insurance" || details.insurance) && (
              <div className="sto-filters">
                <label>
                  Страховая компания
                  <select
                    value={details.insurance?.insurer ?? ""}
                    onChange={(e) =>
                      setDetails({
                        ...details,
                        insurance: {
                          ...details.insurance,
                          insurer: e.target.value as
                            | "nsk"
                            | "alma"
                            | "gosstrakh",
                          paid: details.insurance?.paid ?? false,
                        },
                      })
                    }
                  >
                    <option value="">Выберите компанию</option>
                    {Object.entries(insurerLabels).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="sto-checkbox">
                  <input
                    type="checkbox"
                    checked={details.insurance?.paid ?? false}
                    disabled={!details.insurance?.insurer}
                    onChange={(e) =>
                      setDetails({
                        ...details,
                        insurance: {
                          insurer: details.insurance!.insurer,
                          paid: e.target.checked,
                          ...(e.target.checked ? { paidAt: today() } : {}),
                        },
                      })
                    }
                  />
                  Оплатила страховая
                </label>
                {details.insurance?.paid && (
                  <label>
                    Дата оплаты страховой *
                    <input
                      type="date"
                      max={today()}
                      required
                      value={details.insurance.paidAt ?? ""}
                      onChange={(e) =>
                        setDetails({
                          ...details,
                          insurance: {
                            ...details.insurance!,
                            paidAt: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                )}
                <p className="muted sto-wide">
                  Отметка страховой хранится отдельно. Для учёта поступивших
                  денег добавьте сумму оплаты в журнал ниже.
                </p>
              </div>
            )}
            {(details.payments ?? []).map((p) => (
              <div className="sto-line" key={p.id}>
                <span>
                  {formatDateOnly(p.paidAt)} · {payerLabels[p.payer]}{" "}
                  {p.insurer ? `· ${insurerLabels[p.insurer]}` : ""}
                </span>
                <b>{formatCurrency(p.amount)}</b>
              </div>
            ))}
            <div className="sto-filters">
              <label>
                Плательщик
                <select
                  value={payment.payer}
                  onChange={(e) =>
                    setPayment({
                      ...payment,
                      payer: e.target.value as ServicePaymentEntry["payer"],
                    })
                  }
                >
                  {Object.entries(payerLabels).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Сумма
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={payment.amount}
                  onChange={(e) =>
                    setPayment({ ...payment, amount: e.target.value })
                  }
                />
              </label>
              <label>
                Дата оплаты
                <input
                  type="date"
                  value={payment.paidAt}
                  onChange={(e) =>
                    setPayment({ ...payment, paidAt: e.target.value })
                  }
                />
              </label>
              <button
                type="button"
                className="button button--secondary"
                disabled={busy}
                onClick={() => void addPayment()}
              >
                Добавить оплату
              </button>
            </div>
          </fieldset>
          <p className="muted">
            Перед завершением обязательны номер заказ-наряда и список работ.
            Изменения и готовность машины отправляются бригадиру.
          </p>
          {canEdit && (
            <div className="row-actions">
              <button
                className="button button--secondary"
                disabled={busy}
                onClick={() => void save()}
              >
                Сохранить
              </button>
              {!closed(selected) && (
                <button
                  className="button"
                  disabled={
                    busy ||
                    (selected.serviceStage === "sent_to_service" &&
                      (!details.waitingComment?.trim() ||
                        !details.plannedRepairDate)) ||
                    (selected.incidentType === "accident" &&
                      ((selected.serviceStage === "sent_to_service" &&
                        !details.beforePhoto) ||
                        (selected.serviceStage === "in_repair" &&
                          (!details.beforePhoto || !details.afterPhoto)))) ||
                    (selected.serviceStage === "in_repair" &&
                      (!details.orderNumber?.trim() ||
                        !details.works?.some((w) => w.trim())))
                  }
                  onClick={() =>
                    void save(
                      selected.serviceStage === "sent_to_service"
                        ? "awaiting_repair"
                        : selected.serviceStage === "awaiting_repair"
                          ? "in_repair"
                          : "completed",
                    )
                  }
                >
                  {selected.serviceStage === "sent_to_service"
                    ? "Подтвердить прибытие"
                    : selected.serviceStage === "awaiting_repair"
                      ? "Начать ремонт"
                      : "Завершить ремонт"}
                </button>
              )}
            </div>
          )}
        </section>
      )}
    </section>
  );
}
