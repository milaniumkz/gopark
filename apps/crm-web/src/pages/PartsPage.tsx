import { useEffect, useMemo, useState } from "react";
import type { VehicleListItem } from "@gopark/contracts";
import { hasCrmCapability } from "../lib/crm-access";
import { useApiMutation } from "../hooks/useApiMutation";
import { useApiQuery } from "../hooks/useApiQuery";
import { AsyncState } from "../ui/AsyncState";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { ReadOnlyNotice } from "../ui/ReadOnlyNotice";
import { StatCard } from "../ui/StatCard";
import { useAuth } from "../ui/AuthContext";
import { FinanceIcon, LedgerIcon, ReportsIcon } from "../ui/CrmIcons";
import {
  downloadCsvTable,
  formatCurrency,
  formatDateTime,
  formatShortId,
} from "../lib/utils";
import {
  VEHICLE_MAKE_OPTIONS,
  getVehicleModelOptions,
} from "../lib/vehicleCatalog";

type PartItem = {
  id: string;
  name: string;
  sku: string | null;
  make: string | null;
  model: string | null;
  productionYear: number | null;
  unit: string;
  quantity: number;
  minQuantity: number;
  unitPrice: number | null;
  supplier: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

type PartMovementItem = {
  id: string;
  partId: string;
  partName: string;
  requesterCompany?: string | null;
  carId: string | null;
  carLabel: string | null;
  type: "receive" | "writeoff";
  quantity: number;
  unitPrice: number | null;
  reason: string | null;
  note: string | null;
  createdAt: string;
};

type PartsOverview = {
  parts: PartItem[];
  movements: PartMovementItem[];
};

type ReceivePartBody = {
  partId?: string;
  name?: string;
  sku?: string;
  make?: string;
  model?: string;
  productionYear?: number;
  unit?: string;
  quantity: number;
  requesterCompany?: string;
  minQuantity?: number;
  unitPrice?: number;
  supplier?: string;
  note?: string;
};

type WriteoffPartBody = {
  requesterCompany?: string;
  partId: string;
  carId?: string;
  quantity: number;
  reason?: string;
  note?: string;
};

function vehicleLabel(vehicle: VehicleListItem): string {
  return [vehicle.plateNumber, vehicle.make, vehicle.model]
    .filter(Boolean)
    .join(" ");
}

function movementLabel(type: PartMovementItem["type"]): string {
  return type === "receive" ? "Приход" : "Списание";
}

function movementTone(type: PartMovementItem["type"]): string {
  return type === "receive" ? "badge badge--green" : "badge badge--orange";
}

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function PartsPage() {
  const { session } = useAuth();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const api = useApiQuery<PartsOverview>(
    `parts?${new URLSearchParams({ ...(dateFrom ? { from: dateFrom } : {}), ...(dateTo ? { to: dateTo } : {}) })}`,
  );
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const vehiclesApi = useApiQuery<VehicleListItem[]>("cars");
  const receivePart = useApiMutation<PartsOverview, ReceivePartBody>(
    "parts/receive",
  );
  const writeoffPart = useApiMutation<PartsOverview, WriteoffPartBody>(
    "parts/writeoff",
  );
  const canManageParts = hasCrmCapability(
    session.requestUserRole,
    "manage-parts",
  );

  const [query, setQuery] = useState("");
  const [receivePartId, setReceivePartId] = useState("");
  const [receiveName, setReceiveName] = useState("");
  const [receiveSku, setReceiveSku] = useState("");
  const [receiveMake, setReceiveMake] = useState("");
  const [receiveModel, setReceiveModel] = useState("");
  const [receiveProductionYear, setReceiveProductionYear] = useState("");
  const [receiveUnit, setReceiveUnit] = useState("шт");
  const [receiveQuantity, setReceiveQuantity] = useState("1");
  const [receiveMinQuantity, setReceiveMinQuantity] = useState("");
  const [receiveUnitPrice, setReceiveUnitPrice] = useState("");
  const [receiveSupplier, setReceiveSupplier] = useState("");
  const [receiveNote, setReceiveNote] = useState("");
  const [writeoffCompany, setWriteoffCompany] = useState("");

  const [companyFilter, setCompanyFilter] = useState("");
  const [movementType, setMovementType] = useState("");
  const [writeoffPartId, setWriteoffPartId] = useState("");
  const [writeoffCarId, setWriteoffCarId] = useState("");
  const [writeoffQuantity, setWriteoffQuantity] = useState("1");
  const [writeoffReason, setWriteoffReason] = useState("Ремонт авто");
  const [writeoffNote, setWriteoffNote] = useState("");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<"all" | "low">("all");
  const [activeForm, setActiveForm] = useState<"none" | "receive" | "writeoff">(
    "none",
  );

  useEffect(() => {
    if (activeForm === "none") return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveForm("none");
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [activeForm]);
  const parts = api.data?.parts ?? [];
  const allMovements = api.data?.movements ?? [];
  const companies = [
    ...new Set([
      ...(settingsApi.data?.companies ?? []),
      ...(session.companyName ? [session.companyName] : []),
      "СТО",
    ]),
  ];
  const movements = allMovements.filter(
    (m) =>
      (!dateFrom || m.createdAt.slice(0, 10) >= dateFrom) &&
      (!dateTo || m.createdAt.slice(0, 10) <= dateTo) &&
      (!companyFilter || (m.requesterCompany ?? "unknown") === companyFilter) &&
      (!movementType || m.type === movementType) &&
      (!query ||
        `${m.partName} ${m.carLabel ?? ""} ${m.reason ?? ""} ${m.requesterCompany ?? ""}`
          .toLowerCase()
          .includes(query.toLowerCase())),
  );
  const byCompany = new Map<
    string,
    {
      received: number;
      written: number;
      receiveCost: number;
      writeCost: number;
      unknown: number;
    }
  >();
  for (const m of movements) {
    const key = m.requesterCompany ?? "Не указан (старые записи)";
    const row = byCompany.get(key) ?? {
      received: 0,
      written: 0,
      receiveCost: 0,
      writeCost: 0,
      unknown: 0,
    };
    if (m.type === "receive") {
      row.received += m.quantity;
      row.receiveCost += m.quantity * (m.unitPrice ?? 0);
    } else {
      row.written += m.quantity;
      row.writeCost += m.quantity * (m.unitPrice ?? 0);
    }
    if (m.unitPrice == null) row.unknown++;
    byCompany.set(key, row);
  }
  const totals = [...byCompany.values()].reduce(
    (s, r) => ({
      received: s.received + r.received,
      written: s.written + r.written,
      receiveCost: s.receiveCost + r.receiveCost,
      writeCost: s.writeCost + r.writeCost,
      unknown: s.unknown + r.unknown,
    }),
    { received: 0, written: 0, receiveCost: 0, writeCost: 0, unknown: 0 },
  );
  const receiveModelOptions = getVehicleModelOptions(receiveMake);
  const vehicles = vehiclesApi.data ?? [];
  const normalizedQuery = query.trim().toLowerCase();
  const filteredParts = useMemo(
    () =>
      parts.filter(
        (item) =>
          (stockFilter === "all" || item.quantity <= item.minQuantity) &&
          (normalizedQuery
            ? [
                item.name,
                item.sku ?? "",
                item.make ?? "",
                item.model ?? "",
                item.productionYear ?? "",
                item.supplier ?? "",
                item.note ?? "",
              ]
                .join(" ")
                .toLowerCase()
                .includes(normalizedQuery)
            : true),
      ),
    [normalizedQuery, parts, stockFilter],
  );
  const totalQuantity = parts.reduce((sum, item) => sum + item.quantity, 0);
  const lowStockCount = parts.filter(
    (item) => item.quantity <= item.minQuantity,
  ).length;
  const estimatedValue = parts.reduce(
    (sum, item) => sum + item.quantity * (item.unitPrice ?? 0),
    0,
  );
  const selectedWriteoffPart =
    parts.find((item) => item.id === writeoffPartId) ?? parts[0] ?? null;
  const selectedReceiveExisting = Boolean(receivePartId);

  async function handleReceive(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setFormMessage(null);

    if (!receiveSupplier) {
      setFormMessage("Выберите заказчика — компанию или СТО.");
      return;
    }
    const quantity = Number(receiveQuantity);
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setFormMessage("Укажите положительное количество прихода.");
      return;
    }

    if (!receivePartId && !receiveName.trim()) {
      setFormMessage("Выберите запчасть или укажите название новой.");
      return;
    }

    try {
      await receivePart.mutate({
        partId: receivePartId || undefined,
        name: receiveName.trim() || undefined,
        sku: receiveSku.trim() || undefined,
        make: receiveMake.trim() || undefined,
        model: receiveModel.trim() || undefined,
        productionYear: parseOptionalNumber(receiveProductionYear),
        unit: receiveUnit.trim() || "шт",
        quantity,
        minQuantity: parseOptionalNumber(receiveMinQuantity),
        unitPrice: parseOptionalNumber(receiveUnitPrice),
        requesterCompany: receiveSupplier,
        note: receiveNote.trim() || undefined,
      });
      void api
        .refetch({ silent: true })
        .catch(() =>
          setFormMessage(
            "Операция сохранена, но не удалось обновить склад. Обновите страницу.",
          ),
        );
      setReceiveQuantity("1");
      setReceiveName("");
      setReceiveSku("");
      setReceiveMake("");
      setReceiveModel("");
      setReceiveProductionYear("");
      setReceiveNote("");
      setReceiveSupplier("");
      setActiveForm("none");
      setFormMessage("Приход запчастей сохранён.");
    } catch (error) {
      setFormMessage(
        error instanceof Error ? error.message : "Не удалось сохранить приход.",
      );
    }
  }

  async function handleWriteoff(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    setFormMessage(null);

    if (!writeoffCompany) {
      setFormMessage("Выберите компанию или СТО для списания.");
      return;
    }
    const partId = writeoffPartId || selectedWriteoffPart?.id;
    const quantity = Number(writeoffQuantity);
    if (!partId || !Number.isInteger(quantity) || quantity <= 0) {
      setFormMessage("Выберите запчасть и положительное количество списания.");
      return;
    }

    if (selectedWriteoffPart && quantity > selectedWriteoffPart.quantity) {
      setFormMessage(
        `Недостаточно остатка: доступно ${selectedWriteoffPart.quantity} ${selectedWriteoffPart.unit}.`,
      );
      return;
    }

    try {
      await writeoffPart.mutate({
        partId,
        carId: writeoffCarId || undefined,
        requesterCompany: writeoffCompany,
        quantity,
        reason: writeoffReason.trim() || undefined,
        note: writeoffNote.trim() || undefined,
      });
      void api
        .refetch({ silent: true })
        .catch(() =>
          setFormMessage(
            "Операция сохранена, но не удалось обновить склад. Обновите страницу.",
          ),
        );
      setWriteoffQuantity("1");
      setWriteoffNote("");
      setWriteoffCompany("");
      setActiveForm("none");
      setFormMessage("Списание запчасти сохранено.");
    } catch (error) {
      setFormMessage(
        error instanceof Error ? error.message : "Не удалось списать запчасть.",
      );
    }
  }

  function handleExport(): void {
    downloadCsvTable(
      "gopark-parts.csv",
      [
        "part",
        "sku",
        "make",
        "model",
        "production_year",
        "quantity",
        "unit",
        "min_quantity",
        "unit_price",
        "supplier",
      ],
      filteredParts.map((item) => [
        item.name,
        item.sku ?? "",
        item.make ?? "",
        item.model ?? "",
        item.productionYear ?? "",
        item.quantity,
        item.unit,
        item.minQuantity,
        item.unitPrice ?? "",
        item.supplier ?? "",
      ]),
    );
  }

  return (
    <section className="page-stack parts-page">
      <div className="hero-card">
        <p className="eyebrow">Запчасти</p>
        <h2>Склад запчастей</h2>
        <p>
          Приход запчастей на склад, остатки и списание на конкретный автомобиль
          после ремонта или обслуживания.
        </p>
        <div className="toolbar">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по названию, артикулу, марке, модели"
          />
          <select
            value={stockFilter}
            onChange={(event) =>
              setStockFilter(event.target.value as typeof stockFilter)
            }
          >
            <option value="all">Все остатки</option>
            <option value="low">Низкий остаток</option>
          </select>
          {filteredParts.length ? (
            <button onClick={handleExport}>Скачать CSV</button>
          ) : null}
          {canManageParts ? (
            <>
              <button
                type="button"
                onClick={() => (setFormMessage(null), setActiveForm("receive"))}
              >
                Приход
              </button>
              <button
                type="button"
                onClick={() => (
                  setFormMessage(null),
                  setActiveForm("writeoff")
                )}
              >
                Списать
              </button>
            </>
          ) : null}
        </div>
        {!canManageParts ? (
          <ReadOnlyNotice message="Для этой роли доступен только просмотр склада запчастей." />
        ) : null}
      </div>

      <div className="stats-grid">
        <StatCard
          title="Позиций"
          value={String(parts.length)}
          subtitle="Номенклатура запчастей"
          tone="blue"
          icon={<ReportsIcon width={18} height={18} />}
          onClick={() => {
            setStockFilter("all");
            setQuery("");
          }}
        />
        <StatCard
          title="Остаток"
          value={String(totalQuantity)}
          subtitle="Суммарное количество"
          tone="green"
          icon={<LedgerIcon width={18} height={18} />}
          onClick={() => {
            setStockFilter("all");
            setQuery("");
          }}
        />
        <StatCard
          title="Низкий остаток"
          value={String(lowStockCount)}
          subtitle="Количество ниже минимума"
          tone="orange"
          icon={<FinanceIcon width={18} height={18} />}
          onClick={() => {
            setStockFilter("low");
            setQuery("");
          }}
        />
        <StatCard
          title="Стоимость"
          value={formatCurrency(estimatedValue)}
          subtitle="Оценка по цене прихода"
          tone="purple"
          icon={<FinanceIcon width={18} height={18} />}
          onClick={() => {
            setStockFilter("all");
            setQuery("");
          }}
        />
      </div>

      <article className="panel">
        <h3>Статистика движений запчастей</h3>
        <div className="toolbar">
          <label>
            С
            <input
              aria-label="Запчасти с"
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label>
            По
            <input
              aria-label="Запчасти по"
              type="date"
              value={dateTo}
              min={dateFrom || undefined}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <select
            aria-label="Фильтр заказчика"
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
          >
            <option value="">Все компании и СТО</option>
            {companies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="unknown">Заказчик не указан</option>
          </select>
          <select
            aria-label="Тип движения"
            value={movementType}
            onChange={(e) => setMovementType(e.target.value)}
          >
            <option value="">Все движения</option>
            <option value="receive">Приходы / заказы</option>
            <option value="writeoff">Списания</option>
          </select>
        </div>
        <div className="parts-period-stats">
          {[
            ["Получено, ед.", totals.received],
            ["Списано, ед.", totals.written],
            ["Сумма приходов", formatCurrency(totals.receiveCost)],
            ["Сумма списаний", formatCurrency(totals.writeCost)],
          ].map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <p className="muted">
          Период применяется к движениям. Складские остатки выше — текущие.
          Операций без цены: {totals.unknown}; их стоимость не включена в суммы.
          Приходы отражают полученные заказы, не заявки в ожидании.
        </p>
        <div className="parts-table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Компания / СТО</th>
                <th>Получено</th>
                <th>Сумма приходов</th>
                <th>Списано</th>
                <th>Сумма списаний</th>
                <th>Без цены</th>
              </tr>
            </thead>
            <tbody>
              {[...byCompany].map(([name, r]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{r.received}</td>
                  <td>{formatCurrency(r.receiveCost)}</td>
                  <td>{r.written}</td>
                  <td>{formatCurrency(r.writeCost)}</td>
                  <td>{r.unknown}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
      {canManageParts && activeForm !== "none" ? (
        <>
          <button
            type="button"
            className="entity-modal__backdrop"
            aria-label="Закрыть форму запчастей"
            onClick={() => setActiveForm("none")}
          />
          <section
            className="entity-modal"
            aria-modal="true"
            role="dialog"
            aria-label={
              activeForm === "receive"
                ? "Приход запчастей"
                : "Списание запчастей"
            }
          >
            <div className="entity-modal__header">
              <div>
                <p className="eyebrow">Запчасти</p>
                <h3>
                  {activeForm === "receive"
                    ? "Приход запчастей"
                    : "Списание на авто"}
                </h3>
              </div>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setActiveForm("none")}
              >
                Закрыть
              </button>
            </div>
            {activeForm === "receive" ? (
              <form
                className="quick-form entity-modal__body"
                onSubmit={(event) => void handleReceive(event)}
              >
                {formMessage && (
                  <p className="quick-form__meta" role="alert">
                    {formMessage}
                  </p>
                )}
                <p className="quick-form__meta">
                  Выберите существующую позицию или заведите новую сразу при
                  приходе.
                </p>
                <select
                  value={receivePartId}
                  onChange={(event) => setReceivePartId(event.target.value)}
                >
                  <option value="">Новая запчасть</option>
                  {parts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · остаток {item.quantity} {item.unit}
                    </option>
                  ))}
                </select>
                {!selectedReceiveExisting ? (
                  <>
                    <input
                      value={receiveName}
                      onChange={(event) => setReceiveName(event.target.value)}
                      placeholder="Название запчасти"
                    />
                    <input
                      value={receiveSku}
                      onChange={(event) => setReceiveSku(event.target.value)}
                      placeholder="Артикул"
                    />
                    <input
                      list="parts-car-make-options"
                      value={receiveMake}
                      onChange={(event) => setReceiveMake(event.target.value)}
                      placeholder="Марка авто"
                    />
                    <input
                      list="parts-car-model-options"
                      value={receiveModel}
                      onChange={(event) => setReceiveModel(event.target.value)}
                      placeholder="Модель авто"
                    />
                    <datalist id="parts-car-make-options">
                      {VEHICLE_MAKE_OPTIONS.map((item) => (
                        <option key={item} value={item} />
                      ))}
                    </datalist>
                    <datalist id="parts-car-model-options">
                      {receiveModelOptions.map((item) => (
                        <option key={item} value={item} />
                      ))}
                    </datalist>
                    <input
                      value={receiveProductionYear}
                      onChange={(event) =>
                        setReceiveProductionYear(event.target.value)
                      }
                      placeholder="Год выпуска"
                    />
                  </>
                ) : null}
                <input
                  value={receiveQuantity}
                  onChange={(event) => setReceiveQuantity(event.target.value)}
                  placeholder="Количество"
                />
                <input
                  value={receiveUnit}
                  onChange={(event) => setReceiveUnit(event.target.value)}
                  placeholder="Ед. изм., например шт"
                />
                <input
                  value={receiveMinQuantity}
                  onChange={(event) =>
                    setReceiveMinQuantity(event.target.value)
                  }
                  placeholder="Минимальный остаток"
                />
                <input
                  value={receiveUnitPrice}
                  onChange={(event) => setReceiveUnitPrice(event.target.value)}
                  placeholder="Цена за единицу"
                />
                <label>
                  Заказчик — компания / СТО
                  <select
                    aria-label="Заказчик"
                    required
                    value={receiveSupplier}
                    onChange={(event) => setReceiveSupplier(event.target.value)}
                  >
                    <option value="">Выберите заказчика</option>
                    {companies.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  value={receiveNote}
                  onChange={(event) => setReceiveNote(event.target.value)}
                  placeholder="Комментарий"
                />
                <button type="submit" disabled={receivePart.loading}>
                  {receivePart.loading ? "Сохраняем..." : "Сохранить приход"}
                </button>
              </form>
            ) : (
              <form
                className="quick-form entity-modal__body"
                onSubmit={(event) => void handleWriteoff(event)}
              >
                {formMessage && (
                  <p className="quick-form__meta" role="alert">
                    {formMessage}
                  </p>
                )}
                <label>
                  Компания / СТО
                  <select
                    aria-label="Компания списания"
                    required
                    value={writeoffCompany}
                    onChange={(e) => setWriteoffCompany(e.target.value)}
                  >
                    <option value="">Выберите компанию</option>
                    {companies.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="quick-form__meta">
                  Списание уменьшает складской остаток и фиксирует автомобиль,
                  на который ушла запчасть.
                </p>
                <select
                  value={writeoffPartId || (selectedWriteoffPart?.id ?? "")}
                  onChange={(event) => setWriteoffPartId(event.target.value)}
                >
                  {parts.length ? (
                    parts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · доступно {item.quantity} {item.unit}
                      </option>
                    ))
                  ) : (
                    <option value="">Нет запчастей на складе</option>
                  )}
                </select>
                <select
                  value={writeoffCarId}
                  onChange={(event) => setWriteoffCarId(event.target.value)}
                >
                  <option value="">Авто не указано</option>
                  {vehicles.map((item) => (
                    <option key={item.id} value={item.id}>
                      {vehicleLabel(item)}
                    </option>
                  ))}
                </select>
                <input
                  value={writeoffQuantity}
                  onChange={(event) => setWriteoffQuantity(event.target.value)}
                  placeholder="Количество"
                />
                <input
                  value={writeoffReason}
                  onChange={(event) => setWriteoffReason(event.target.value)}
                  placeholder="Причина списания"
                />
                <input
                  value={writeoffNote}
                  onChange={(event) => setWriteoffNote(event.target.value)}
                  placeholder="Комментарий"
                />
                {selectedWriteoffPart ? (
                  <div className="panel-note">
                    Доступно: {selectedWriteoffPart.quantity}{" "}
                    {selectedWriteoffPart.unit}
                  </div>
                ) : null}
                <button
                  type="submit"
                  disabled={writeoffPart.loading || !parts.length}
                >
                  {writeoffPart.loading ? "Списываем..." : "Списать запчасть"}
                </button>
              </form>
            )}
          </section>
        </>
      ) : null}

      {formMessage ? <div className="panel-note">{formMessage}</div> : null}

      <AsyncState
        loading={api.loading}
        error={api.error}
        empty={!parts.length}
        emptyContent={
          <EmptyStatePanel
            title="Запчасти не заведены"
            message="Добавьте первый приход запчастей на склад."
          />
        }
      >
        <article className="panel">
          <div className="panel__title">
            <ReportsIcon width={18} height={18} />
            <h3>Остатки запчастей</h3>
          </div>
          <table className="data-table parts-table">
            <thead>
              <tr>
                <th>Запчасть</th>
                <th>Артикул</th>
                <th>Марка</th>
                <th>Модель</th>
                <th>Год</th>
                <th>Остаток</th>
                <th>Мин.</th>
                <th>Цена</th>
                <th>Поставщик</th>
              </tr>
            </thead>
            <tbody>
              {filteredParts.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="identity-cell">
                      <strong title={item.name}>{item.name}</strong>
                      <span>{formatShortId(item.id)}</span>
                    </div>
                  </td>
                  <td>{item.sku ?? "—"}</td>
                  <td>{item.make ?? "—"}</td>
                  <td>{item.model ?? "—"}</td>
                  <td>{item.productionYear ?? "—"}</td>
                  <td>
                    <span
                      className={
                        item.quantity <= item.minQuantity
                          ? "badge badge--orange"
                          : "badge badge--green"
                      }
                    >
                      {item.quantity} {item.unit}
                    </span>
                  </td>
                  <td>{item.minQuantity}</td>
                  <td>
                    {item.unitPrice === null
                      ? "—"
                      : formatCurrency(item.unitPrice)}
                  </td>
                  <td>{item.supplier ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      </AsyncState>

      <article className="panel">
        <div className="panel__title">
          <LedgerIcon width={18} height={18} />
          <h3>Журнал движений</h3>
        </div>
        {movements.length ? (
          <table className="data-table parts-movements-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Тип</th>
                <th>Запчасть</th>
                <th>Количество</th>
                <th>Авто</th>
                <th>Причина</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((item) => (
                <tr key={item.id}>
                  <td>{formatDateTime(item.createdAt)}</td>
                  <td>
                    <span className={movementTone(item.type)}>
                      {movementLabel(item.type)}
                    </span>
                  </td>
                  <td>{item.partName}</td>
                  <td>{item.quantity}</td>
                  <td>{item.carLabel ?? "—"}</td>
                  <td>{item.requesterCompany ?? "Не указан"}</td>
                  <td>
                    {item.unitPrice == null
                      ? "Цена не указана"
                      : formatCurrency(item.quantity * item.unitPrice)}
                  </td>
                  <td>{item.reason ?? item.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyStatePanel
            title="Движений пока нет"
            message="После прихода или списания здесь появится история."
          />
        )}
      </article>
    </section>
  );
}
