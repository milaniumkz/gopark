import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type {
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
};
const payerLabels = {
  company: "GoPark",
  driver: "Водитель",
  insurance: "Страховая компания",
};
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
  const [managerFilter, setManagerFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [payer, setPayer] = useState("all");
  const [selected, setSelected] = useState<ManagerIncidentItem | null>(null);
  const [details, setDetails] = useState<ServiceRepairDetails>({ reason: "" });
  const [payment, setPayment] = useState({
    amount: "",
    paidAt: today(),
    payer: "company" as ServicePaymentEntry["payer"],
  });
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
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
      (caseType === "all" || i.serviceCaseType === caseType) &&
      (!managerFilter ||
        (i.managerLabel ?? "")
          .toLowerCase()
          .includes(managerFilter.toLowerCase())) &&
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
      caseType === "all" &&
      payer === "all" &&
      (!managerFilter ||
        (c.managerName ?? "")
          .toLowerCase()
          .includes(managerFilter.toLowerCase())) &&
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
        (caseType === "all" || i.serviceCaseType === caseType) &&
        (!managerFilter ||
          (i.managerLabel ?? "")
            .toLowerCase()
            .includes(managerFilter.toLowerCase()))
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
    setDetails(
      i.serviceDetails ?? { reason: i.repairNote ?? i.description ?? "" },
    );
    setMessage("");
  }
  async function save(stage?: string) {
    if (!selected || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const next = await patchJson<ManagerIncidentItem, unknown>(
        `incidents/${selected.id}`,
        {
          serviceDetails: details,
          ...(stage
            ? {
                serviceStage: stage,
                status: stage === "completed" ? "closed" : "open",
              }
            : {}),
          repairNote: details.reason,
        },
      );
      setSelected(next);
      setDetails(next.serviceDetails ?? details);
      await refresh();
      setMessage(
        stage === "completed"
          ? "Ремонт завершён. Бригадир получит уведомление."
          : "Данные сохранены. Бригадир получит уведомление.",
      );
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Не удалось сохранить ремонт",
      );
    } finally {
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
  function addPayment() {
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Укажите сумму оплаты больше нуля");
      return;
    }
    setDetails({
      ...details,
      payments: [
        ...(details.payments ?? []),
        {
          id: crypto.randomUUID(),
          amount,
          paidAt: payment.paidAt,
          payer: payment.payer,
        },
      ],
    });
    setPayment({ ...payment, amount: "" });
    setMessage("Оплата добавлена в форму. Нажмите «Сохранить».");
  }
  const error = incidents.error || cars.error || drivers.error;
  return (
    <section className="page-stack service-page">
      <div className="hero-card hero-card--dashboard">
        <div className="hero-card__main">
          <p className="eyebrow">Ремонт и услуги</p>
          <h2>СТО</h2>
          <p>Причина, этапы ремонта, заказ-наряд и оплата в одной карточке.</p>
        </div>
        <div className="hero-card__actions">
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
            String((cars.data ?? []).filter(c => c.status === "maintenance" && (company === "all" || c.companyName === company)).length),
          ],
          ["Стоимость услуг", formatCurrency(sums.cost)],
          ["Оплачено", formatCurrency(sums.paid)],
          ["Не оплачено", formatCurrency(Math.max(0, sums.cost - sums.paid))],
          ["Прибыль СТО · 30%", formatCurrency(sums.cost * 0.3)],
        ].map(([label, value]) => (
          <div className="sto-stat" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="panel sto-filters">
        <label>
          Компания
          <select value={company} onChange={(e) => setCompany(e.target.value)}>
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
          <input
            value={managerFilter}
            onChange={(e) => setManagerFilter(e.target.value)}
            placeholder="Имя бригадира"
          />
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
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="active">Активные ремонты</option>
            <option value="all">Все ремонты</option>
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
          . Исторические расходы не включаются в прибыль без стоимости услуг.
          <br />
          Прибыль начисленная: {formatCurrency(sums.cost * 0.3)} · полученная:{" "}
          {formatCurrency(sums.paid * 0.3)} · ожидаемая:{" "}
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
              <h3>{vehicleLabel(i)}</h3>
              <span
                className={`sto-badge ${closed(i) ? "sto-badge--done" : ""}`}
              >
                {labels[i.serviceStage ?? ""] ?? i.status}
              </span>
            </div>
            <p className="muted">
              {i.driverId
                ? (driverById.get(i.driverId)?.fullName ?? "Водитель не указан")
                : "Без водителя"}{" "}
              · {i.managerLabel ?? "Бригадир не указан"}
            </p>
            <div className="sto-reason">
              {i.serviceDetails?.reason ??
                i.repairNote ??
                i.description ??
                "Причина не указана"}
            </div>
            <p className="muted">
              Отправлен: {stamp(i.serviceDetails?.sentAt)}
              <br />
              Прибыл: {stamp(i.serviceDetails?.arrivedAt)}
            </p>
            <div className="sto-line">
              <span>Услуги</span>
              <b>
                {i.serviceDetails?.serviceCost !== undefined
                  ? formatCurrency(cost(i))
                  : "Не указана"}
              </b>
            </div>
            <div className="sto-line">
              <span>Оплачено / остаток</span>
              <b>
                {formatCurrency(paid(i))} /{" "}
                {formatCurrency(Math.max(0, cost(i) - paid(i)))}
              </b>
            </div>
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
      {!rows.length && !untracked.length && !incidents.loading && !error && (
        <div className="panel">Ремонтов по фильтру нет.</div>
      )}
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
                  .filter((c) => !["sold", "written_off"].includes(c.status))
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
      {selected && (
        <section className="panel sto-detail" aria-label="Карточка ремонта">
          <div className="sto-card-heading">
            <h3>Карточка ремонта · {vehicleLabel(selected)}</h3>
            <button
              className="button button--secondary"
              onClick={() => setSelected(null)}
            >
              Закрыть карточку
            </button>
          </div>
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
          <fieldset disabled={!canEdit || busy}>
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
            {(details.payments ?? []).map((p) => (
              <div className="sto-line" key={p.id}>
                <span>
                  {formatDateOnly(p.paidAt)} · {payerLabels[p.payer]}
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
                onClick={addPayment}
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
