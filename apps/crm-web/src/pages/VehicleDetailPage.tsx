import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { hasCrmAccess, hasCrmCapability } from "../lib/crm-access";
import { useApiQuery } from "../hooks/useApiQuery";
import { AsyncState } from "../ui/AsyncState";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { useAuth } from "../ui/AuthContext";
import { downloadCsv } from "../lib/utils";
import { VEHICLE_MAKE_OPTIONS, getVehicleModelOptions } from "../lib/vehicleCatalog";
import { patchJson } from "../lib/api";
import { formatCurrency, formatDateOnly, formatRepairPeriodLabel, getIncidentPriorityLabel, getPaymentProviderLabel, getStatusLabel, getStatusTone } from "../lib/utils";
import { StatCard } from "../ui/StatCard";
import { CarIcon, ContractsIcon, DriversIcon, FinanceIcon, ShieldIcon, WalletIcon } from "../ui/CrmIcons";
import type { ContractListItem, DriverListItem, ManagerIncidentItem, PaymentListItem, VehicleDetail } from "@gopark/contracts";

function getContractStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Активный";
    case "closed":
      return "Выкуплен";
    case "terminated":
      return "Расторгнут";
    case "problem":
      return "Проблемный";
    case "draft":
      return "Черновик";
    default:
      return status;
  }
}

export function VehicleDetailPage() {
  const { session } = useAuth();
  const { carId } = useParams<{ carId: string }>();
  const [editPlateNumber, setEditPlateNumber] = useState("");
  const [editVin, setEditVin] = useState("");
  const [editMake, setEditMake] = useState("");
  const [editModel, setEditModel] = useState("");
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editProductionYear, setEditProductionYear] = useState("");
  const [editMileage, setEditMileage] = useState("");
  const [editColor, setEditColor] = useState("");
  const [editStatus, setEditStatus] = useState("free");
  const [editPurchasePrice, setEditPurchasePrice] = useState("");
  const [editCustomsCost, setEditCustomsCost] = useState("");
  const [editDeliveryCost, setEditDeliveryCost] = useState("");
  const [editRepairCost, setEditRepairCost] = useState("");
  const [editTargetSalePrice, setEditTargetSalePrice] = useState("");
  const [vehicleMessage, setVehicleMessage] = useState<string | null>(null);
  const [vehicleSaving, setVehicleSaving] = useState(false);
  const [incidentMessage, setIncidentMessage] = useState<string | null>(null);
  const [pendingIncidentActionId, setPendingIncidentActionId] = useState<string | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [isEditFormOpen, setIsEditFormOpen] = useState(false);
  const [activeVehicleTab, setActiveVehicleTab] = useState<"info" | "drivers" | "finance" | "incidents" | "history">("info");
  const api = useApiQuery<VehicleDetail>(`cars/${carId}`);
  const driversApi = useApiQuery<DriverListItem[]>("drivers");
  const contractsApi = useApiQuery<ContractListItem[]>("contracts");
  const incidentsApi = useApiQuery<ManagerIncidentItem[]>("incidents");
  const paymentsApi = useApiQuery<PaymentListItem[]>("payments");
  const settingsApi = useApiQuery<{ companies: string[] }>("settings/overview");
  const driverMap = new Map((driversApi.data ?? []).map((item) => [item.id, item.fullName]));
  const companies = settingsApi.data?.companies ?? [];
  const contractMap = new Map((contractsApi.data ?? []).map((item) => [item.id, item.contractNumber]));
  const activeContract = (contractsApi.data ?? []).find((item) => item.id === api.data?.activeContractId) ?? null;
  const vehicleContracts = [...(contractsApi.data ?? [])]
    .filter((item) => item.carId === api.data?.id)
    .sort((left, right) => (right.startDate ?? "").localeCompare(left.startDate ?? "") || right.contractNumber.localeCompare(left.contractNumber));
  const vehicleContractIds = new Set(vehicleContracts.map((item) => item.id));
  const vehicleIncidents = (incidentsApi.data ?? []).filter((item) => item.carId === api.data?.id);
  const allVehiclePayments = (paymentsApi.data ?? []).filter((item) => vehicleContractIds.has(item.contractId));
  const vehiclePayments = allVehiclePayments.filter((item) => item.contractId === activeContract?.id);
  const vehicleHistoryPaidTotal = allVehiclePayments.reduce((sum, item) => sum + item.appliedAmount, 0);
  const vehicleHistoryDebtTotal = vehicleContracts.reduce((sum, item) => sum + item.currentDebt, 0);
  const hasOperationalRisk =
    ["maintenance", "accident", "impound", "written_off"].includes(api.data?.status ?? "") || vehicleIncidents.length > 0;
  const hasActiveFinanceProfile = Boolean(api.data?.activeContractId) || (api.data?.financedAmount ?? 0) > 0;
  const hasOverdueContractDue =
    Boolean(activeContract?.nextDueDate) &&
    (activeContract?.currentDebt ?? 0) > 0 &&
    new Date(activeContract!.nextDueDate!).getTime() < Date.now();
  const assignedDriverLabel = api.data?.assignedDriverId
    ? (driverMap.get(api.data.assignedDriverId) ?? "Водитель назначен")
    : "Не привязан";
  const activeContractLabel = api.data?.activeContractId
    ? (contractMap.get(api.data.activeContractId) ?? "Договор привязан")
    : "Нет договора";
  const canEditVehicle = hasCrmCapability(session.requestUserRole, "create-car", session.managerLevel);
  const editModelOptions = getVehicleModelOptions(editMake);
  const canUpdateIncident = ["owner", "admin", "finance", "manager", "operator"].includes(session.requestUserRole);

  useEffect(() => {
    setEditPlateNumber(api.data?.plateNumber ?? "");
    setEditVin(api.data?.vin ?? "");
    setEditMake(api.data?.make ?? "");
    setEditModel(api.data?.model ?? "");
    setEditCompanyName(api.data?.companyName ?? "");
    setEditProductionYear(api.data?.productionYear?.toString() ?? "");
    setEditMileage(api.data?.mileage?.toString() ?? "");
    setEditColor(api.data?.color ?? "");
    setEditStatus(api.data?.status ?? "free");
    setEditPurchasePrice(api.data?.purchasePrice?.toString() ?? "");
    setEditCustomsCost(api.data?.customsCost?.toString() ?? "");
    setEditDeliveryCost(api.data?.deliveryCost?.toString() ?? "");
    setEditRepairCost(api.data?.repairCost?.toString() ?? "");
    setEditTargetSalePrice(api.data?.targetSalePrice?.toString() ?? "");
  }, [
    api.data?.plateNumber,
    api.data?.vin,
    api.data?.make,
    api.data?.model,
    api.data?.companyName,
    api.data?.productionYear,
    api.data?.mileage,
    api.data?.color,
    api.data?.status,
    api.data?.purchasePrice,
    api.data?.customsCost,
    api.data?.deliveryCost,
    api.data?.repairCost,
    api.data?.targetSalePrice,
  ]);

  function handleExport(): void {
    if (!api.data) {
      return;
    }

    downloadCsv(`gopark-vehicle-${api.data.id}.csv`, [
      ["id", api.data.id],
      ["plate_number", api.data.plateNumber],
      ["vin", api.data.vin],
      ["status", api.data.status],
      ["make", api.data.make ?? ""],
      ["model", api.data.model ?? ""],
      ["production_year", api.data.productionYear ?? ""],
      ["color", api.data.color ?? ""],
      ["purchase_price", api.data.purchasePrice ?? 0],
      ["customs_cost", api.data.customsCost ?? 0],
      ["delivery_cost", api.data.deliveryCost ?? 0],
      ["repair_cost", api.data.repairCost ?? 0],
      ["target_sale_price", api.data.targetSalePrice ?? 0],
      ["total_acquisition_cost", api.data.totalAcquisitionCost ?? 0],
      ["assigned_driver_id", api.data.assignedDriverId ?? ""],
      ["active_contract_id", api.data.activeContractId ?? ""],
      ["financed_amount", api.data.financedAmount ?? 0],
      ["installment_amount", api.data.installmentAmount ?? 0],
    ]);
  }

  async function handleSaveVehicle(): Promise<void> {
    if (!api.data?.id) {
      return;
    }

    setVehicleMessage(null);
    setVehicleSaving(true);
    try {
      await patchJson(`cars/${api.data.id}`, {
        plateNumber: editPlateNumber.trim(),
        vin: editVin.trim(),
        make: editMake.trim(),
        model: editModel.trim(),
        companyName: editCompanyName.trim() || null,
        productionYear: editProductionYear.trim() ? Number(editProductionYear) : null,
        mileage: editMileage.trim() ? Number(editMileage) : null,
        color: editColor.trim(),
        status: editStatus,
        purchasePrice: editPurchasePrice.trim() ? Number(editPurchasePrice) : null,
        customsCost: editCustomsCost.trim() ? Number(editCustomsCost) : null,
        deliveryCost: editDeliveryCost.trim() ? Number(editDeliveryCost) : null,
        repairCost: editRepairCost.trim() ? Number(editRepairCost) : null,
        targetSalePrice: editTargetSalePrice.trim() ? Number(editTargetSalePrice) : null,
      });
      await api.refetch();
      setVehicleMessage("Карточка автомобиля обновлена.");
    } catch (error) {
      setVehicleMessage(error instanceof Error ? error.message : "Не удалось обновить карточку автомобиля.");
    } finally {
      setVehicleSaving(false);
    }
  }

  async function handleIncidentAction(incident: ManagerIncidentItem, status: "resolved" | "closed" | "written_off" | "archived"): Promise<void> {
    setIncidentMessage(null);
    setPendingIncidentActionId(incident.id);
    try {
      const incidentStatus = status === "written_off" ? "closed" : status;
      const completedPeriod = `${(incident.periodLabel || incident.occurredAt || new Date().toISOString()).slice(0, 10)}..${new Date().toISOString().slice(0, 10)}`;
      const updated = await patchJson<ManagerIncidentItem | null, { status: string; serviceStage?: string | null; repairNote?: string | null; periodLabel?: string | null }>(`incidents/${incident.id}`, {
        status: incidentStatus,
        serviceStage: status === "written_off" ? "written_off" : incident.serviceStage,
        periodLabel: ["resolved", "closed", "written_off", "archived"].includes(status) && incident.incidentType === "repair" ? completedPeriod : incident.periodLabel,
        repairNote: status === "written_off" ? (incident.repairNote ?? "Не подлежит восстановлению") : incident.repairNote,
      });
      if (!updated) {
        setIncidentMessage("Инцидент не найден.");
        return;
      }
      if (status === "written_off" && api.data?.id) {
        await patchJson(`cars/${api.data.id}`, { status: "written_off" });
        await api.refetch();
      }

      setIncidentMessage(
        status === "resolved"
          ? "Инцидент переведён в решённые."
          : status === "closed"
            ? "Инцидент закрыт."
            : status === "written_off"
              ? "Авто переведено в списанные."
            : "Инцидент отправлен в архив.",
      );
      await incidentsApi.refetch();
    } catch (error) {
      setIncidentMessage(error instanceof Error ? error.message : "Не удалось обновить инцидент.");
    } finally {
      setPendingIncidentActionId(null);
    }
  }

  return (
    <>
    <section className={`page-stack vehicle-detail-page vehicle-detail-page--parkpro vehicle-detail-tab-${activeVehicleTab}`}>
      <div className="hero-card hero-card--dashboard vehicle-detail-hero">
        <div className="hero-card__main">
          <div className="hero-card__eyebrow">
            <CarIcon width={18} height={18} />
            <span>Карточка автомобиля</span>
          </div>
          <div className="detail-identity">
            <div className="identity-avatar">
              <CarIcon width={20} height={20} />
            </div>
            <div className="detail-identity__meta">
              <h2>{api.data?.plateNumber ?? `Карточка автомобиля ${carId}`}</h2>
              <p>{[api.data?.make, api.data?.model, api.data?.productionYear, api.data?.color].filter(Boolean).join(" · ") || "Марка, модель и год не заполнены"}</p>
              {api.data ? (
                <div className="detail-badges">
                  <span className={getStatusTone(api.data.status)}>{getStatusLabel(api.data.status)}</span>
                  <span className={`inline-pill${api.data.assignedDriverId ? " inline-pill--accent" : ""}`}>{api.data.assignedDriverId ? assignedDriverLabel : "Без водителя"}</span>
                  <span className={`inline-pill${api.data.activeContractId ? " inline-pill--success" : ""}`}>{activeContractLabel}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        <div className="hero-card__actions">
          <div className="toolbar toolbar--hero">
            <Link className="button-link" to="/vehicles">
              К автомобилям
            </Link>
            {canEditVehicle ? (
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setActiveVehicleTab("info");
                  setIsEditFormOpen((current) => !current);
                }}
              >
                Редактировать
              </button>
            ) : null}
            {api.data ? <button onClick={handleExport}>Скачать CSV</button> : null}
          </div>
        </div>
      </div>

      <AsyncState
        loading={api.loading}
        error={api.error}
        empty={!api.data}
        emptyContent={
          <EmptyStatePanel
            title="Автомобиль не найден"
            message={`Карточка ${carId ?? "автомобиля"} недоступна или ещё не создана.`}
            extra={
              <Link className="button-link" to="/vehicles">
                Вернуться к автомобилям
              </Link>
            }
          />
        }
      >
        <div className="stats-grid">
          <StatCard
            title="Госномер"
            value={api.data?.plateNumber ?? "—"}
            subtitle={api.data?.vin}
            tone="blue"
            icon={<CarIcon width={18} height={18} />}
          />
          <StatCard
            title="Статус"
            value={getStatusLabel(api.data?.status ?? "")}
            subtitle="Текущее состояние автомобиля"
            tone="purple"
            icon={<ShieldIcon width={18} height={18} />}
          />
          <StatCard
            title="Стоимость входа"
            value={formatCurrency(api.data?.totalAcquisitionCost ?? 0)}
            subtitle="Покупка, растаможка, доставка и подготовка"
            tone="green"
            icon={<WalletIcon width={18} height={18} />}
          />
          <StatCard
            title="Начисление"
            value={formatCurrency(api.data?.installmentAmount ?? 0)}
            subtitle="Ежедневное начисление по текущему графику"
            tone="orange"
            icon={<FinanceIcon width={18} height={18} />}
          />
        </div>
        <div className="detail-card-tabs vehicle-card-tabs" role="tablist" aria-label="Разделы карточки автомобиля">
          {[
            ["info", "Информация", null],
            ["drivers", "Водители", vehicleContracts.length],
            ["finance", "Финансы", vehiclePayments.length],
            ["incidents", "Инциденты", vehicleIncidents.length],
            ["history", "История", vehicleContracts.length],
          ].map(([tab, label, count]) => (
            <button
              key={tab}
              type="button"
              className={activeVehicleTab === tab ? "detail-card-tab detail-card-tab--active vehicle-card-tab vehicle-card-tab--active" : "detail-card-tab vehicle-card-tab"}
              onClick={() => setActiveVehicleTab(tab as typeof activeVehicleTab)}
            >
              <span>{label}</span>
              {typeof count === "number" ? <small>{count}</small> : null}
            </button>
          ))}
        </div>
        <div className="table-grid">
          <article className="panel vehicle-tab-panel vehicle-tab-panel--info">
            <div className="panel__title">
              <DriversIcon width={18} height={18} />
              <h3>Операционный профиль</h3>
            </div>
            <div className="summary-list">
              <div><span>Водитель</span><strong>{assignedDriverLabel}</strong></div>
              <div><span>Компания</span><strong>{api.data?.companyName ?? "Не выбрана"}</strong></div>
              <div><span>Договор</span><strong>{activeContractLabel}</strong></div>
              <div><span>Открытые инциденты</span><strong>{vehicleIncidents.length}</strong></div>
              <div><span>Паспорт авто</span><strong>{[api.data?.make, api.data?.model, api.data?.productionYear].filter(Boolean).join(" ") || "Не заполнен"}</strong></div>
              <div><span>Пробег</span><strong>{api.data?.mileage ? `${api.data.mileage.toLocaleString("ru-RU")} км` : "Не указан"}</strong></div>
            </div>
            {canEditVehicle ? (
              <div className="toolbar">
                <button type="button" className="button-secondary" onClick={() => setIsEditFormOpen((current) => !current)}>
                  {isEditFormOpen ? "Скрыть редактор" : "Редактировать карточку"}
                </button>
              </div>
            ) : null}
            {canEditVehicle && isEditFormOpen ? (
              <div className="quick-form">
                <p className="quick-form__title">Редактировать карточку</p>
                <div className="form-grid">
                  <input value={editPlateNumber} onChange={(event) => setEditPlateNumber(event.target.value)} placeholder="Госномер" />
                  <input value={editVin} onChange={(event) => setEditVin(event.target.value)} placeholder="VIN" />
                  <input list="vehicle-detail-make-options" value={editMake} onChange={(event) => setEditMake(event.target.value)} placeholder="Марка" />
                  <input list="vehicle-detail-model-options" value={editModel} onChange={(event) => setEditModel(event.target.value)} placeholder="Модель" />
                  <datalist id="vehicle-detail-make-options">
                    {VEHICLE_MAKE_OPTIONS.map((item) => <option key={item} value={item} />)}
                  </datalist>
                  <datalist id="vehicle-detail-model-options">
                    {editModelOptions.map((item) => <option key={item} value={item} />)}
                  </datalist>
                  <select value={editCompanyName} onChange={(event) => setEditCompanyName(event.target.value)}>
                    <option value="">Компания не выбрана</option>
                    {companies.map((company) => (
                      <option key={company} value={company}>
                        {company}
                      </option>
                    ))}
                  </select>
                  <input value={editProductionYear} onChange={(event) => setEditProductionYear(event.target.value)} placeholder="Год выпуска" inputMode="numeric" />
                  <input value={editMileage} onChange={(event) => setEditMileage(event.target.value)} placeholder="Пробег" inputMode="numeric" />
                  <input value={editColor} onChange={(event) => setEditColor(event.target.value)} placeholder="Цвет" />
                  <select value={editStatus} onChange={(event) => setEditStatus(event.target.value)}>
                    <option value="free">Свободна</option>
                    <option value="customs">Растаможка</option>
                    <option value="office">В офисе</option>
                    <option value="assigned">На линии</option>
                    <option value="maintenance">Ремонт</option>
                    <option value="accident">В ДТП</option>
                    <option value="impound">Штрафстоянка</option>
                    <option value="idle">Простой</option>
                    <option value="sold">Продан</option>
                    <option value="written_off">Списан</option>
                  </select>
                  <input value={editPurchasePrice} onChange={(event) => setEditPurchasePrice(event.target.value)} placeholder="Цена покупки" inputMode="numeric" />
                  <input value={editCustomsCost} onChange={(event) => setEditCustomsCost(event.target.value)} placeholder="Растаможка" inputMode="numeric" />
                  <input value={editDeliveryCost} onChange={(event) => setEditDeliveryCost(event.target.value)} placeholder="Доставка" inputMode="numeric" />
                  <input value={editRepairCost} onChange={(event) => setEditRepairCost(event.target.value)} placeholder="Подготовка / ремонт" inputMode="numeric" />
                  <input value={editTargetSalePrice} onChange={(event) => setEditTargetSalePrice(event.target.value)} placeholder="Плановая стоимость" inputMode="numeric" />
                </div>
                <div className="toolbar">
                  <button disabled={vehicleSaving} onClick={() => void handleSaveVehicle()}>
                    {vehicleSaving ? "Сохраняем..." : "Сохранить карточку"}
                  </button>
                </div>
                {vehicleMessage ? <div className="panel-note">{vehicleMessage}</div> : null}
              </div>
            ) : null}
          </article>
          <article className="panel vehicle-tab-panel vehicle-tab-panel--finance">
            <div className="panel__title">
              <FinanceIcon width={18} height={18} />
              <h3>Финансовый профиль</h3>
            </div>
            <div className="detail-list">
              <div className="detail-list__item">
                <strong>Закупка и подготовка</strong>
                <p>
                  Покупка: {formatCurrency(api.data?.purchasePrice ?? 0)} · Растаможка: {formatCurrency(api.data?.customsCost ?? 0)} ·
                  Доставка: {formatCurrency(api.data?.deliveryCost ?? 0)} · Подготовка: {formatCurrency(api.data?.repairCost ?? 0)}.
                </p>
              </div>
              <div className="detail-list__item">
                <strong>Плановая стоимость</strong>
                <p>
                  {formatCurrency(api.data?.targetSalePrice ?? 0)} · Общая стоимость входа {formatCurrency(api.data?.totalAcquisitionCost ?? 0)}.
                </p>
              </div>
              <div className="detail-list__item">
                <strong>Сумма начислений</strong>
                <p>
                  {hasActiveFinanceProfile
                    ? `${formatCurrency(api.data?.financedAmount ?? 0)} по договору. Ежедневное начисление: ${formatCurrency(api.data?.installmentAmount ?? 0)}.`
                    : "Активных начислений пока нет. Показатели появятся после создания договора."}
                </p>
              </div>
              {activeContract ? (
                <div className="detail-list__item">
                  <strong>Ежемесячные начисления</strong>
                  <p>
                    Страховка: {formatCurrency(activeContract.monthlyInsuranceAmount ?? 0)} · GPS: {formatCurrency(activeContract.monthlyGpsAmount ?? 0)}.
                  </p>
                </div>
              ) : null}
              <div className="detail-list__item">
                <strong>{api.data?.activeContractId ? activeContractLabel : "Договор не привязан"}</strong>
                <p>
                  {api.data?.activeContractId
                    ? `Текущий долг по договору: ${formatCurrency(activeContract?.currentDebt ?? 0)}.`
                    : "Нужно создать договор, чтобы включить финансовый контур по автомобилю."}
                </p>
              </div>
              {activeContract?.nextDueDate ? (
                <div className="detail-list__item">
                  <strong>Ближайшее обязательство</strong>
                  <p>
                    {formatCurrency(activeContract.nextDueAmount ?? 0)} {hasOverdueContractDue ? "· просрочено с" : "· до"} {formatDateOnly(activeContract.nextDueDate)}
                  </p>
                </div>
              ) : null}
            </div>
            {api.data?.activeContractId && hasCrmAccess(session.requestUserRole, "financial-ops") && activeContract ? (
              <div className="toolbar">
                {activeContract.currentDebt > 0 ? (
                  <Link
                    className="button-link"
                    to={`/financial-ops?action=payment&source=vehicle&driverId=${activeContract.driverId}&contractId=${activeContract.id}&amount=${activeContract.nextDueAmount ?? activeContract.currentDebt}`}
                  >
                    Подготовить платёж
                  </Link>
                ) : null}
                {activeContract.currentDebt > 0 ? (
                  <Link
                    className="button-link"
                    to={`/financial-ops?action=payoff&source=vehicle&driverId=${activeContract.driverId}&contractId=${activeContract.id}&amount=${activeContract.currentDebt}`}
                  >
                    Досрочно закрыть
                  </Link>
                ) : null}
              </div>
            ) : null}
          </article>
          <article className="panel vehicle-tab-panel vehicle-tab-panel--info">
            <div className="panel__title">
              <ContractsIcon width={18} height={18} />
              <h3>Связанные переходы</h3>
            </div>
            <div className="summary-list">
              {api.data?.assignedDriverId && hasCrmAccess(session.requestUserRole, "driver-detail") ? (
                <div>
                  <span>Карточка водителя</span>
                  <strong>
                    <Link className="table-link" to={`/drivers/${api.data.assignedDriverId}`}>
                      Открыть водителя
                    </Link>
                  </strong>
                </div>
              ) : null}
              {api.data?.activeContractId && hasCrmAccess(session.requestUserRole, "contract-detail") ? (
                <div>
                  <span>Карточка договора</span>
                  <strong>
                    <Link className="table-link" to={`/contracts/${api.data.activeContractId}`}>
                      Открыть договор
                    </Link>
                  </strong>
                </div>
              ) : null}
              {!api.data?.assignedDriverId && !api.data?.activeContractId ? (
                <div>
                  <span>Связи</span>
                  <strong>Связанные карточки пока не найдены</strong>
                </div>
              ) : null}
            </div>
          </article>
          <article className="panel vehicle-tab-panel vehicle-tab-panel--drivers vehicle-tab-panel--history">
            <div className="panel__title">
              <DriversIcon width={18} height={18} />
              <h3>История машины</h3>
            </div>
            <div className="summary-list">
              <div>
                <span>Всего выдач</span>
                <strong>{vehicleContracts.length}</strong>
              </div>
              <div>
                <span>Оплачено по машине</span>
                <strong>{formatCurrency(vehicleHistoryPaidTotal)}</strong>
              </div>
              <div>
                <span>Остаток долга по всем договорам</span>
                <strong>{formatCurrency(vehicleHistoryDebtTotal)}</strong>
              </div>
            </div>
            <AsyncState
              loading={contractsApi.loading || driversApi.loading || paymentsApi.loading}
              error={contractsApi.error || driversApi.error || paymentsApi.error}
              empty={!vehicleContracts.length}
              emptyContent={
                <EmptyStatePanel
                  title="Истории выдачи пока нет"
                  message="Когда по этой машине создадут договоры, здесь появятся все водители и суммы по каждому периоду."
                />
              }
            >
              <div className="summary-list">
                {vehicleContracts.map((contract) => {
                  const contractPayments = allVehiclePayments.filter((payment) => payment.contractId === contract.id);
                  const paidAmount = contractPayments.reduce((sum, payment) => sum + payment.appliedAmount, 0);
                  const driverName = driverMap.get(contract.driverId) ?? "Водитель не найден";
                  return (
                    <div key={contract.id}>
                      <span>
                        {formatDateOnly(contract.startDate)} — {contract.endDate ? formatDateOnly(contract.endDate) : "по сегодня"} · {getContractStatusLabel(contract.status)}
                      </span>
                      <strong>
                        {driverName} · договор {contract.contractNumber}
                      </strong>
                      <p className="panel-note">
                        Начислено {formatCurrency(contract.financedAmount)} · оплачено {formatCurrency(paidAmount)} · остаток {formatCurrency(contract.currentDebt)}
                        {contract.nextDueDate ? ` · ближайшее ${formatCurrency(contract.nextDueAmount ?? 0)} ${formatDateOnly(contract.nextDueDate)}` : ""}
                      </p>
                      <div className="toolbar">
                        {hasCrmAccess(session.requestUserRole, "driver-detail") ? (
                          <Link className="table-link" to={`/drivers/${contract.driverId}`}>
                            Открыть водителя
                          </Link>
                        ) : null}
                        {hasCrmAccess(session.requestUserRole, "contract-detail") ? (
                          <Link className="table-link" to={`/contracts/${contract.id}`}>
                            Открыть договор
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </AsyncState>
          </article>
          <article className="panel vehicle-tab-panel vehicle-tab-panel--finance">
            <div className="panel__title">
              <WalletIcon width={18} height={18} />
              <h3>Платежи по автомобилю</h3>
            </div>
            <AsyncState
              loading={paymentsApi.loading}
              error={paymentsApi.error}
              empty={!vehiclePayments.length}
              emptyContent={
                <EmptyStatePanel
                  title="Платежей пока нет"
                  message="По активному договору этого автомобиля ещё нет зарегистрированных платежей."
                />
              }
            >
              <div className="summary-list">
                {vehiclePayments.map((item) => (
                  <div key={item.id}>
                    <span>
                      {getPaymentProviderLabel(item.provider)} · {formatDateOnly(item.createdAt)}
                    </span>
                    <strong>
                      {formatCurrency(item.amount)}
                      {item.appliedAmount > 0 ? ` · оплачено ${formatCurrency(item.appliedAmount)}` : ""}
                      {item.unappliedAmount > 0 ? ` · остаток ${formatCurrency(item.unappliedAmount)}` : ""}
                    </strong>
                  </div>
                ))}
              </div>
            </AsyncState>
          </article>
          <article className="panel vehicle-tab-panel vehicle-tab-panel--info">
            <div className="panel__title">
              <ShieldIcon width={18} height={18} />
              <h3>Проверка статуса</h3>
            </div>
            <div className="detail-list">
              <div className="detail-list__item">
                <strong>{api.data?.assignedDriverId ? assignedDriverLabel : "Требуется вывод на линию"}</strong>
                <p>{api.data?.assignedDriverId ? "Автомобиль уже работает на линии." : "Автомобиль пока не выведен на линию."}</p>
              </div>
              <div className="detail-list__item">
                <strong>{hasOperationalRisk ? "Требует внимания" : "Операционно стабилен"}</strong>
                <p>{hasOperationalRisk ? "По автомобилю нужен разбор статуса или открытого инцидента." : "Открытых инцидентов и проблемного статуса нет."}</p>
              </div>
            </div>
          </article>
          <article className="panel vehicle-tab-panel vehicle-tab-panel--incidents">
            <div className="panel__title">
              <ShieldIcon width={18} height={18} />
              <h3>Инциденты по автомобилю</h3>
            </div>
            {incidentMessage ? <div className="panel-note">{incidentMessage}</div> : null}
            <div className="detail-list">
              {vehicleIncidents.length ? vehicleIncidents.map((item) => (
                <div key={item.id} className="detail-list__item">
                  <strong>{item.title}</strong>
                  <p>
                    {getStatusLabel(item.status)} · {getIncidentPriorityLabel(item.priority)}
                    {item.incidentType === "repair" ? ` · ${formatRepairPeriodLabel(item.occurredAt, item.periodLabel)}` : ""}
                    {item.driverId && driverMap.get(item.driverId)
                      ? ` · водитель ${driverMap.get(item.driverId)}`
                      : ""}
                  </p>
                  {item.accidentPhotoUrl?.startsWith("data:image/") ? (
                    <button type="button" className="photo-preview-button photo-preview-button--small" onClick={() => setPhotoPreviewUrl(item.accidentPhotoUrl ?? null)}>
                      <img src={item.accidentPhotoUrl} alt="Фото ДТП" className="photo-preview-image photo-preview-image--contain" />
                    </button>
                  ) : null}
                  <div className="toolbar">
                    <Link className="table-link" to="/incidents?view=operations">
                      Рабочий поток
                    </Link>
                    {canUpdateIncident && item.status === "open" ? (
                      <>
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={pendingIncidentActionId === item.id}
	                          onClick={() => void handleIncidentAction(item, "resolved")}
                        >
                          Решить
                        </button>
                        <button
                          type="button"
                          className="button-secondary"
                          disabled={pendingIncidentActionId === item.id}
	                          onClick={() => void handleIncidentAction(item, "closed")}
                        >
                          Закрыть
                        </button>
                      </>
                    ) : null}
	                    {canUpdateIncident && ["accident", "repair"].includes(item.incidentType ?? "") && item.serviceStage !== "written_off" ? (
	                      <button
	                        type="button"
	                        className="button-secondary"
	                        disabled={pendingIncidentActionId === item.id}
	                        onClick={() => void handleIncidentAction(item, "written_off")}
	                      >
	                        Не подлежит восстановлению
	                      </button>
	                    ) : null}
	                    {canUpdateIncident && item.status !== "archived" ? (
	                      <button
                        type="button"
                        className="button-secondary"
                        disabled={pendingIncidentActionId === item.id}
	                        onClick={() => void handleIncidentAction(item, "archived")}
                      >
                        В архив
                      </button>
                    ) : null}
                  </div>
                </div>
              )) : (
                <div className="detail-list__item">
                  <strong>Открытых инцидентов нет</strong>
                  <p>По этому автомобилю сейчас нет активных кейсов.</p>
                </div>
              )}
            </div>
          </article>
        </div>
      </AsyncState>
    </section>
    {photoPreviewUrl ? (
      <button type="button" className="photo-lightbox" onClick={() => setPhotoPreviewUrl(null)} aria-label="Закрыть фото">
        <img src={photoPreviewUrl} alt="Просмотр фото" />
      </button>
    ) : null}
    </>
  );
}
