import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useApiQuery } from "../hooks/useApiQuery";
import { useApiMutation } from "../hooks/useApiMutation";
import { patchJson } from "../lib/api";
import { AsyncState } from "../ui/AsyncState";
import { EmptyStatePanel } from "../ui/EmptyStatePanel";
import { StatCard } from "../ui/StatCard";
import { DriversIcon, FinanceIcon, ShieldIcon, WalletIcon } from "../ui/CrmIcons";
import { downloadCsvTable, formatShortId, getStatusLabel, getStatusTone, getUserRoleLabel } from "../lib/utils";
import type { DriverListItem, SettingsOverview, UserAdminListItem } from "@gopark/contracts";

export function UsersPage() {
  const [companyFilter, setCompanyFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [mfaFilter, setMfaFilter] = useState("all");
  const [sortKey, setSortKey] = useState("name_asc");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [createPhone, setCreatePhone] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createFirstName, setCreateFirstName] = useState("");
  const [createLastName, setCreateLastName] = useState("");
  const [createRole, setCreateRole] = useState<UserAdminListItem["role"]>("manager");
  const [createCustomRoleKey, setCreateCustomRoleKey] = useState("");
  const [createCompanyName, setCreateCompanyName] = useState("");
  const [createManagerLevel, setCreateManagerLevel] = useState<"regular" | "senior">("regular");
  const [createMessage, setCreateMessage] = useState<string | null>(null);
  const [editUserId, setEditUserId] = useState<string | null>(null);
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState<UserAdminListItem["role"]>("admin");
  const [editCustomRoleKey, setEditCustomRoleKey] = useState("");
  const [editStatus, setEditStatus] = useState("active");
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editManagerLevel, setEditManagerLevel] = useState<"regular" | "senior">("regular");
  const [editMfaEnabled, setEditMfaEnabled] = useState(false);
  const [editMessage, setEditMessage] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [archiveCandidate, setArchiveCandidate] = useState<UserAdminListItem | null>(null);
  const [reassignManagerId, setReassignManagerId] = useState("");
  const [userActionMessage, setUserActionMessage] = useState<string | null>(null);
  const [bulkRole, setBulkRole] = useState<"keep" | UserAdminListItem["role"]>("keep");
  const [bulkCustomRoleKey, setBulkCustomRoleKey] = useState<"keep" | string>("keep");
  const [bulkStatus, setBulkStatus] = useState<"keep" | "active" | "blocked" | "invited">("keep");
  const [bulkCompanyName, setBulkCompanyName] = useState<string>("keep");
  const [bulkMfaMode, setBulkMfaMode] = useState<"keep" | "enabled" | "disabled">("keep");
  const [bulkManagerLevel, setBulkManagerLevel] = useState<"regular" | "senior">("regular");
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [activeAdminForm, setActiveAdminForm] = useState<"none" | "bulk" | "create">("none");
  const api = useApiQuery<UserAdminListItem[]>("users");
  const driversApi = useApiQuery<DriverListItem[]>("drivers");
  const settingsApi = useApiQuery<SettingsOverview>("settings/overview");
  const createUser = useApiMutation<
    UserAdminListItem,
    {
      phone: string;
      password: string;
      firstName: string;
      lastName: string;
      role: UserAdminListItem["role"];
      customRoleKey?: string | null;
      companyName?: string | null;
      managerLevel?: "regular" | "senior" | null;
      seniorManagerId?: string | null;
    }
  >("users");
  const companies = settingsApi.data?.companies ?? [];
  const customRoles = settingsApi.data?.customCrmRoles ?? [];
  const baseUsers = (api.data ?? []).filter(
    (item) => item.status !== "blocked" && (companyFilter === "all" || (item.companyName ?? "") === companyFilter),
  );
  const drivers = driversApi.data ?? [];
  const users = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = baseUsers.filter((item) => {
      const displayRole = getDisplayRoleLabel(item).toLowerCase();
      const matchesQuery =
        !normalizedQuery ||
        `${item.id} ${item.displayName} ${item.login} ${item.companyName ?? ""} ${displayRole}`
          .toLowerCase()
          .includes(normalizedQuery);
      const roleKey = item.customRoleKey || item.role;
      const matchesRole = roleFilter === "all" || roleKey === roleFilter;
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesMfa =
        mfaFilter === "all" ||
        (mfaFilter === "enabled" ? item.mfaEnabled : !item.mfaEnabled);
      return matchesQuery && matchesRole && matchesStatus && matchesMfa;
    });

    return filtered.sort((left, right) => {
      switch (sortKey) {
        case "name_desc":
          return right.displayName.localeCompare(left.displayName, "ru");
        case "role_asc":
          return getDisplayRoleLabel(left).localeCompare(getDisplayRoleLabel(right), "ru");
        case "company_asc":
          return (left.companyName ?? "").localeCompare(right.companyName ?? "", "ru");
        case "status_asc":
          return getStatusLabel(left.status).localeCompare(getStatusLabel(right.status), "ru");
        case "login_asc":
          return left.login.localeCompare(right.login, "ru");
        case "name_asc":
        default:
          return left.displayName.localeCompare(right.displayName, "ru");
      }
    });
  }, [baseUsers, mfaFilter, query, roleFilter, sortKey, statusFilter]);
  const totalUsers = users.length;
  const activeUsers = users.filter((item) => item.status === "active").length;
  const mfaDisabledCount = users.filter((item) => !item.mfaEnabled).length;
  const selectedCount = selectedUserIds.length;
  const allSelected = users.length > 0 && selectedCount === users.length;
  const roleCounts = new Map<string, number>();
  const driverCountByManager = new Map<string, number>();
  const vehicleCountByManager = new Map<string, number>();

  for (const item of users) {
    const roleKey = item.customRoleKey || item.role;
    roleCounts.set(roleKey, (roleCounts.get(roleKey) ?? 0) + 1);
  }
  for (const driver of drivers) {
    if (driver.managerId) {
      driverCountByManager.set(driver.managerId, (driverCountByManager.get(driver.managerId) ?? 0) + 1);
      if (driver.activeContractId) {
        vehicleCountByManager.set(driver.managerId, (vehicleCountByManager.get(driver.managerId) ?? 0) + 1);
      }
    }
  }

  const archiveTargetManagers = users.filter(
    (item) =>
      item.role === "manager" &&
      item.status !== "blocked" &&
      item.id !== archiveCandidate?.id &&
      item.managerProfileId &&
      (archiveCandidate?.companyName ? item.companyName === archiveCandidate.companyName : true),
  );

  function getCustomRoleLabel(roleKey?: string | null): string | null {
    return customRoles.find((role) => role.key === roleKey)?.label ?? null;
  }

  function getDisplayRoleLabel(item: UserAdminListItem): string {
    const customRoleLabel = getCustomRoleLabel(item.customRoleKey);
    if (customRoleLabel) {
      return customRoleLabel;
    }
    if (item.role === "manager" && item.managerLevel === "senior") {
      return "Старший бригадир";
    }
    return getUserRoleLabel(item.role);
  }

  function toggleUserSelection(userId: string): void {
    setSelectedUserIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  function toggleSelectAll(): void {
    setSelectedUserIds(allSelected ? [] : users.map((item) => item.id));
  }

  const roleRouteMap: Record<string, string> = {
    manager: "/drivers",
    driver: "/drivers",
    finance: "/financial-ops",
    auditor: "/audit",
    operator: "/vehicles",
    admin: "/dashboard",
    owner: "/dashboard",
  };
  const roleActionMap: Record<string, Array<{ to: string; label: string }>> = {
    manager: [
      { to: "/drivers", label: "Водители" },
      { to: "/dashboard", label: "Главная" },
    ],
    driver: [
      { to: "/drivers", label: "Водители" },
      { to: "/payments", label: "Платежи" },
    ],
    finance: [
      { to: "/financial-ops", label: "Финансы" },
      { to: "/payouts", label: "Выплаты" },
    ],
    auditor: [
      { to: "/audit", label: "Журнал" },
      { to: "/outbox", label: "События" },
    ],
    operator: [
      { to: "/vehicles", label: "Автомобили" },
      { to: "/incidents", label: "Инциденты" },
    ],
    admin: [
      { to: "/dashboard", label: "Главная" },
      { to: "/users", label: "Пользователи" },
    ],
    owner: [
      { to: "/dashboard", label: "Главная" },
      { to: "/reports", label: "Отчеты" },
    ],
  };

  function handleExport(): void {
    if (!api.data?.length) {
      return;
    }

    downloadCsvTable(
      "gopark-users.csv",
      ["user", "company", "display_name", "login", "role", "status", "mfa"],
      users.map((item) => [
        formatShortId(item.id),
        item.companyName ?? "",
        item.displayName,
        item.login,
        getDisplayRoleLabel(item),
        getStatusLabel(item.status),
        item.mfaEnabled ? "Включена" : "Выключена",
      ]),
    );
  }

  async function handleCreateUser(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setCreateMessage(null);

    const created = await createUser.mutate({
      phone: createPhone.trim(),
      password: createPassword,
      firstName: createFirstName.trim(),
      lastName: createLastName.trim(),
      role: createRole,
      customRoleKey: createCustomRoleKey || null,
      companyName: createCompanyName || undefined,
      ...(createRole === "manager"
        ? {
            managerLevel: createManagerLevel,
            seniorManagerId: null,
          }
        : {}),
    });

    setCreatePhone("");
    setCreatePassword("");
    setCreateFirstName("");
    setCreateLastName("");
    setCreateRole("manager");
    setCreateCustomRoleKey("");
    setCreateCompanyName("");
    setCreateManagerLevel("regular");
    setActiveAdminForm("none");
    await api.refetch();
    setCreateMessage(`Пользователь ${created.displayName} зарегистрирован по номеру ${created.login}.`);
  }

  function handleStartEdit(user: UserAdminListItem): void {
    setEditUserId(user.id);
    setEditPhone(user.login);
    setEditRole(user.role);
    setEditCustomRoleKey(user.customRoleKey ?? "");
    setEditStatus(user.status);
    setEditCompanyName(user.companyName ?? "");
    setEditManagerLevel(user.managerLevel === "senior" ? "senior" : "regular");
    setEditMfaEnabled(user.mfaEnabled);
    setEditMessage(null);
  }

  function handleCancelEdit(): void {
    setEditUserId(null);
    setEditMessage(null);
    setEditSaving(false);
  }

  async function handleSaveEdit(): Promise<void> {
    if (!editUserId) {
      return;
    }

    setEditMessage(null);
    setEditSaving(true);
    try {
      await patchJson(`users/${editUserId}`, {
        role: editRole,
        phone: editPhone.trim(),
        customRoleKey: editCustomRoleKey || null,
        status: editStatus,
        mfaEnabled: editMfaEnabled,
        companyName: editCompanyName || null,
        ...(editRole === "manager"
          ? {
              managerLevel: editManagerLevel,
              seniorManagerId: null,
            }
          : {}),
      });
      await api.refetch();
      setEditMessage("Карточка пользователя обновлена.");
    } catch (error) {
      setEditMessage(error instanceof Error ? error.message : "Не удалось обновить пользователя.");
    } finally {
    setEditSaving(false);
  }
  }

  async function archiveUser(user: UserAdminListItem, nextManagerId?: string | null): Promise<void> {
    setDeletingUserId(user.id);
    setUserActionMessage(null);
    try {
      await patchJson(`users/${user.id}`, { status: "blocked", reassignManagerId: nextManagerId ?? null });
      await api.refetch();
      await driversApi.refetch();
      setUserActionMessage("Пользователь удалён из списка.");
      setArchiveCandidate(null);
      setReassignManagerId("");
    } catch (error) {
      setUserActionMessage(error instanceof Error ? error.message : "Не удалось удалить пользователя.");
    } finally {
      setDeletingUserId(null);
    }
  }

  async function handleArchiveUser(user: UserAdminListItem): Promise<void> {
    const assignedDriversCount = user.managerProfileId ? driverCountByManager.get(user.managerProfileId) ?? 0 : 0;
    if (user.role === "manager" && assignedDriversCount > 0) {
      const firstTarget =
        users.find(
          (item) =>
            item.role === "manager" &&
            item.status !== "blocked" &&
            item.id !== user.id &&
            item.managerProfileId &&
            item.managerLevel !== "senior" &&
            (user.companyName ? item.companyName === user.companyName : true),
        )?.managerProfileId ??
        users.find(
          (item) =>
            item.role === "manager" &&
            item.status !== "blocked" &&
            item.id !== user.id &&
            item.managerProfileId &&
            (user.companyName ? item.companyName === user.companyName : true),
        )?.managerProfileId ??
        "";
      setArchiveCandidate(user);
      setReassignManagerId(firstTarget);
      setUserActionMessage(null);
      return;
    }

    if (!window.confirm(`Удалить пользователя ${user.displayName}? Он будет скрыт из списка и заблокирован.`)) {
      return;
    }

    await archiveUser(user);
  }

  async function handleBulkArchive(): Promise<void> {
    if (!selectedUserIds.length) {
      setBulkMessage("Выберите хотя бы одного пользователя.");
      return;
    }
    if (!window.confirm(`Удалить выбранных пользователей: ${selectedUserIds.length}? Они будут скрыты из списка и заблокированы.`)) {
      return;
    }

    setBulkMessage(null);
    setBulkDeleting(true);
    let updatedCount = 0;

    try {
      for (const userId of selectedUserIds) {
        await patchJson(`users/${userId}`, { status: "blocked" });
        updatedCount += 1;
      }
      await api.refetch();
      setSelectedUserIds([]);
      setBulkMessage(`Удалено из списка: ${updatedCount}.`);
    } catch (error) {
      setBulkMessage(error instanceof Error ? error.message : "Не удалось удалить выбранных пользователей.");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleBulkSave(): Promise<void> {
    if (!selectedUserIds.length) {
      setBulkMessage("Выберите хотя бы одного пользователя.");
      return;
    }

    if (
      bulkRole === "keep" &&
      bulkCustomRoleKey === "keep" &&
      bulkStatus === "keep" &&
      bulkCompanyName === "keep" &&
      bulkMfaMode === "keep"
    ) {
      setBulkMessage("Выберите хотя бы одно массовое изменение.");
      return;
    }

    setBulkMessage(null);
    setBulkSaving(true);
    let updatedCount = 0;

    try {
      for (const userId of selectedUserIds) {
        await patchJson(`users/${userId}`, {
          ...(bulkRole !== "keep" ? { role: bulkRole } : {}),
          ...(bulkCustomRoleKey !== "keep" ? { customRoleKey: bulkCustomRoleKey || null } : {}),
          ...(bulkRole === "manager"
            ? {
                managerLevel: bulkManagerLevel,
                seniorManagerId: null,
              }
            : {}),
          ...(bulkStatus !== "keep" ? { status: bulkStatus } : {}),
          ...(bulkCompanyName !== "keep" ? { companyName: bulkCompanyName || null } : {}),
          ...(bulkMfaMode !== "keep" ? { mfaEnabled: bulkMfaMode === "enabled" } : {}),
        });
        updatedCount += 1;
      }

      await api.refetch();
      setSelectedUserIds([]);
      setBulkRole("keep");
      setBulkCustomRoleKey("keep");
      setBulkStatus("keep");
      setBulkCompanyName("keep");
      setBulkMfaMode("keep");
      setBulkManagerLevel("regular");
      setBulkMessage(`Массово обновлено ${updatedCount} пользователей.`);
    } catch (error) {
      setBulkMessage(error instanceof Error ? error.message : "Не удалось массово обновить пользователей.");
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <section className="page-stack users-page">
      <div className="hero-card">
        <p className="eyebrow">Пользователи</p>
        <h2>Пользователи</h2>
        <p>Роли, статусы и защита входа.</p>
        {api.data?.length ? (
          <div className="toolbar">
            <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)}>
              <option value="all">Все компании</option>
              {companies.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            <button onClick={handleExport}>Скачать CSV</button>
            <button type="button" onClick={() => setActiveAdminForm("create")}>
              Добавить пользователя
            </button>
            <button type="button" onClick={() => setActiveAdminForm("bulk")}>
              Массовые действия
            </button>
          </div>
        ) : null}
      </div>
      <div className="parkpro-tabs">
        <Link className="parkpro-tab parkpro-tab--active" to="/users">Пользователи</Link>
        <Link className="parkpro-tab" to="/audit">Журнал действий</Link>
      </div>

      {archiveCandidate ? (
        <>
          <button
            type="button"
            className="entity-modal__backdrop"
            aria-label="Закрыть перенос водителей"
            onClick={() => {
              setArchiveCandidate(null);
              setReassignManagerId("");
            }}
          />
          <div className="entity-modal" role="dialog" aria-modal="true">
            <div className="entity-modal__header">
              <div>
                <p className="eyebrow">Удаление бригадира</p>
                <h3>Передать водителей</h3>
                <p>
                  У {archiveCandidate.displayName} водителей:{" "}
                  {archiveCandidate.managerProfileId
                    ? driverCountByManager.get(archiveCandidate.managerProfileId) ?? 0
                    : 0}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setArchiveCandidate(null);
                  setReassignManagerId("");
                }}
              >
                Закрыть
              </button>
            </div>
            <div className="entity-modal__body">
              <div className="quick-form">
                <select value={reassignManagerId} onChange={(event) => setReassignManagerId(event.target.value)}>
                  <option value="">Выберите нового бригадира</option>
                  {archiveTargetManagers.map((manager) => (
                    <option key={manager.id} value={manager.managerProfileId ?? ""}>
                      {manager.displayName} · {getDisplayRoleLabel(manager)}
                    </option>
                  ))}
                </select>
                {archiveTargetManagers.length ? null : (
                  <div className="panel-note">Нет доступного бригадира для переноса водителей.</div>
                )}
                {userActionMessage ? <div className="panel-note">{userActionMessage}</div> : null}
                <div className="toolbar">
                  <button
                    type="button"
                    disabled={!reassignManagerId || deletingUserId === archiveCandidate.id}
                    onClick={() => void archiveUser(archiveCandidate, reassignManagerId)}
                  >
                    {deletingUserId === archiveCandidate.id ? "Удаляем..." : "Передать и удалить"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setArchiveCandidate(null);
                      setReassignManagerId("");
                    }}
                  >
                    Отменить
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      <AsyncState
        loading={api.loading}
        error={api.error}
        empty={!api.data?.length}
        emptyContent={
          <EmptyStatePanel
            title="Пользователи не найдены"
            message="Список сотрудников пока пуст или ещё не обновился. Попробуйте позже."
          />
        }
      >
        <div className="stats-grid users-stats-grid">
          <StatCard
            title="Всего пользователей"
            value={String(totalUsers)}
            subtitle="Все учетные записи в системе"
            tone="blue"
            icon={<DriversIcon width={18} height={18} />}
            onClick={() => {
              setRoleFilter("all");
              setStatusFilter("all");
              setMfaFilter("all");
              setQuery("");
            }}
          />
          <StatCard
            title="Активные"
            value={String(activeUsers)}
            subtitle="Сейчас доступны для работы"
            tone="green"
            icon={<FinanceIcon width={18} height={18} />}
            onClick={() => setStatusFilter("active")}
          />
          <StatCard
            title="Без доп. защиты"
            value={String(mfaDisabledCount)}
            subtitle="Стоит проверить вход и доступ"
            tone="orange"
            icon={<ShieldIcon width={18} height={18} />}
            onClick={() => setMfaFilter("disabled")}
          />
          <StatCard
            title="Бригадиры"
            value={String(roleCounts.get("manager") ?? 0)}
            subtitle="Работают с водителями и статусами"
            tone="purple"
            icon={<WalletIcon width={18} height={18} />}
            onClick={() => setRoleFilter("manager")}
          />
        </div>
        <article className="panel user-roles-panel">
          <h3>Роли и рабочие зоны</h3>
          <div className="summary-list user-roles-list">
            {[...roleCounts.entries()].map(([role, count]) => (
              <div key={role}>
                <span>{getCustomRoleLabel(role) ?? getUserRoleLabel(role)}</span>
                <strong>{count}</strong>
                {roleActionMap[role]?.length ? (
                  <div className="toolbar">
                    {roleActionMap[role].map((action) => (
                      <Link key={`${role}-${action.to}`} className="table-link" to={action.to}>
                        {action.label}
                      </Link>
                    ))}
                  </div>
                ) : roleRouteMap[role] ? (
                  <Link className="table-link" to={roleRouteMap[role]}>
                    Открыть раздел
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="panel__title">
            <ShieldIcon width={18} height={18} />
            <h3>Массовое администрирование</h3>
          </div>
          <div className="toolbar">
            <button type="button" className="button-secondary" onClick={() => setActiveAdminForm((current) => current === "bulk" ? "none" : "bulk")}>
              {activeAdminForm === "bulk" ? "Скрыть массовые действия" : "Открыть массовые действия"}
            </button>
            <span className="panel-note">Выбрано: {selectedCount}</span>
          </div>
          {activeAdminForm === "bulk" ? (
          <div className="quick-form">
            <p className="quick-form__meta">Роли, статус, компания и MFA для группы пользователей.</p>
            <div className="toolbar">
              <button type="button" onClick={toggleSelectAll}>
                {allSelected ? "Снять выбор" : "Выбрать всех"}
              </button>
              <span className="panel-note">Выбрано: {selectedCount}</span>
            </div>
            <div className="form-grid">
              <select value={bulkRole} onChange={(event) => setBulkRole(event.target.value as typeof bulkRole)}>
                <option value="keep">Роль без изменений</option>
                <option value="admin">Администратор</option>
                <option value="owner">Владелец</option>
                <option value="finance">Финансы</option>
                <option value="operator">Оператор</option>
                <option value="auditor">Аудитор</option>
                <option value="manager">Бригадир</option>
              </select>
              <select value={bulkCustomRoleKey} onChange={(event) => setBulkCustomRoleKey(event.target.value)}>
                <option value="keep">Кастомная роль без изменений</option>
                <option value="">Без кастомной роли</option>
                {customRoles.map((role) => (
                  <option key={role.key} value={role.key}>
                    {role.label}
                  </option>
                ))}
              </select>
              {bulkRole === "manager" ? (
                <select value={bulkManagerLevel} onChange={(event) => setBulkManagerLevel(event.target.value as "regular" | "senior")}>
                  <option value="regular">Обычный бригадир</option>
                  <option value="senior">Старший бригадир</option>
                </select>
              ) : null}
              <select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value as typeof bulkStatus)}>
                <option value="keep">Статус без изменений</option>
                <option value="active">Активный</option>
                <option value="blocked">Заблокирован</option>
                <option value="invited">Приглашён</option>
              </select>
              <select value={bulkCompanyName} onChange={(event) => setBulkCompanyName(event.target.value)}>
                <option value="keep">Компания без изменений</option>
                <option value="">Без компании</option>
                {companies.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <select value={bulkMfaMode} onChange={(event) => setBulkMfaMode(event.target.value as typeof bulkMfaMode)}>
                <option value="keep">MFA без изменений</option>
                <option value="enabled">MFA включить</option>
                <option value="disabled">MFA выключить</option>
              </select>
            </div>
            {bulkMessage ? <div className="panel-note">{bulkMessage}</div> : null}
            <button type="button" disabled={bulkSaving || !selectedCount} onClick={() => void handleBulkSave()}>
              {bulkSaving ? "Сохраняем..." : "Применить массово"}
            </button>
            <button type="button" disabled={bulkDeleting || !selectedCount} onClick={() => void handleBulkArchive()}>
              {bulkDeleting ? "Удаляем..." : "Удалить выбранных"}
            </button>
          </div>
          ) : null}
        </article>
        <article className="panel">
          <div className="panel__title">
            <DriversIcon width={18} height={18} />
            <h3>Регистрация по номеру</h3>
          </div>
          <div className="toolbar">
            <button type="button" className="button-secondary" onClick={() => setActiveAdminForm((current) => current === "create" ? "none" : "create")}>
              {activeAdminForm === "create" ? "Скрыть регистрацию" : "Открыть регистрацию"}
            </button>
            {createMessage ? <span className="panel-note">{createMessage}</span> : null}
          </div>
          {activeAdminForm === "create" ? (
          <form className="quick-form" onSubmit={(event) => void handleCreateUser(event)}>
            <p className="quick-form__meta">Новая учётка сотрудника создаётся сразу по номеру телефона и дальше входит без email.</p>
            <input value={createFirstName} onChange={(event) => setCreateFirstName(event.target.value)} placeholder="Имя" />
            <input value={createLastName} onChange={(event) => setCreateLastName(event.target.value)} placeholder="Фамилия" />
            <input value={createPhone} onChange={(event) => setCreatePhone(event.target.value)} placeholder="+996555123456" />
            <input value={createPassword} onChange={(event) => setCreatePassword(event.target.value)} type="password" placeholder="Пароль" />
            <select value={createRole} onChange={(event) => setCreateRole(event.target.value as UserAdminListItem["role"])}>
              <option value="manager">Бригадир</option>
              <option value="admin">Администратор</option>
              <option value="owner">Владелец</option>
              <option value="finance">Финансы</option>
              <option value="operator">Оператор</option>
              <option value="auditor">Аудитор</option>
            </select>
            <select value={createCustomRoleKey} onChange={(event) => setCreateCustomRoleKey(event.target.value)}>
              <option value="">Без кастомной роли</option>
              {customRoles.map((role) => (
                <option key={role.key} value={role.key}>
                  {role.label}
                </option>
              ))}
            </select>
            {createRole === "manager" ? (
              <select value={createManagerLevel} onChange={(event) => setCreateManagerLevel(event.target.value as "regular" | "senior")}>
                <option value="regular">Обычный бригадир</option>
                <option value="senior">Старший бригадир</option>
              </select>
            ) : null}
            <select value={createCompanyName} onChange={(event) => setCreateCompanyName(event.target.value)}>
              <option value="">Без компании</option>
              {companies.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
            {createMessage ? <div className="panel-note">{createMessage}</div> : null}
            {createUser.error ? <div className="panel-note">Ошибка регистрации: {createUser.error}</div> : null}
            <button type="submit" disabled={createUser.loading}>
              {createUser.loading ? "Регистрируем..." : "Зарегистрировать по номеру"}
            </button>
          </form>
          ) : null}
        </article>
        <article className="panel">
          {userActionMessage ? <div className="panel-note">{userActionMessage}</div> : null}
          <h3>Список пользователей</h3>
          <div className="quick-form">
            <div className="form-grid">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Поиск по имени, телефону, роли или ID"
              />
              <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
                <option value="all">Все роли</option>
                <option value="manager">Бригадиры</option>
                <option value="admin">Администраторы</option>
                <option value="owner">Владельцы</option>
                <option value="finance">Финансы</option>
                <option value="operator">Операторы</option>
                <option value="auditor">Аудиторы</option>
                {customRoles.map((role) => (
                  <option key={role.key} value={role.key}>
                    {role.label}
                  </option>
                ))}
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">Все статусы</option>
                <option value="active">Активные</option>
                <option value="invited">Приглашённые</option>
              </select>
              <select value={mfaFilter} onChange={(event) => setMfaFilter(event.target.value)}>
                <option value="all">Любая защита</option>
                <option value="enabled">MFA включена</option>
                <option value="disabled">MFA выключена</option>
              </select>
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
                <option value="name_asc">Имя А-Я</option>
                <option value="name_desc">Имя Я-А</option>
                <option value="role_asc">По роли</option>
                <option value="company_asc">По компании</option>
                <option value="status_asc">По статусу</option>
                <option value="login_asc">По логину</option>
              </select>
            </div>
            <div className="toolbar">
              <span className="panel-note">Показано: {users.length}</span>
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setRoleFilter("all");
                  setStatusFilter("all");
                  setMfaFilter("all");
                  setSortKey("name_asc");
                }}
              >
                Сбросить фильтры
              </button>
            </div>
          </div>
          <div className="table-scroll">
            <table className="data-table users-table">
              <thead>
                <tr>
                  <th />
                  <th>Пользователь</th>
                  <th>Имя</th>
                  <th>Логин</th>
                  <th>Роль</th>
                  <th>Статус</th>
                  <th>Защита входа</th>
                  <th>Действия</th>
                </tr>
              </thead>
              <tbody>
                {users.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(item.id)}
                      onChange={() => toggleUserSelection(item.id)}
                    />
                  </td>
                  <td>
                    <div className="identity-cell">
                      <strong>{formatShortId(item.id)}</strong>
                    </div>
                  </td>
                  <td>
                    <div className="amount-stack">
                      <strong>{item.displayName}</strong>
                      {editUserId === item.id ? (
                        <select value={editCompanyName} onChange={(event) => setEditCompanyName(event.target.value)}>
                          <option value="">Без компании</option>
                          {companies.map((company) => (
                            <option key={company} value={company}>
                              {company}
                            </option>
                          ))}
                        </select>
                      ) : item.companyName ? (
                        <span>{item.companyName}</span>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    {editUserId === item.id ? (
                      <input value={editPhone} onChange={(event) => setEditPhone(event.target.value)} placeholder="+996..." />
                    ) : (
                      item.login
                    )}
                  </td>
                  <td>
                    <div className="identity-cell">
                      {editUserId === item.id ? (
                        <>
                          <select value={editRole} onChange={(event) => setEditRole(event.target.value as UserAdminListItem["role"])}>
                            <option value="admin">Администратор</option>
                            <option value="owner">Владелец</option>
                            <option value="finance">Финансы</option>
                            <option value="operator">Оператор</option>
                            <option value="auditor">Аудитор</option>
                            <option value="manager">Бригадир</option>
                            <option value="driver">Водитель</option>
                          </select>
                          <select value={editCustomRoleKey} onChange={(event) => setEditCustomRoleKey(event.target.value)}>
                            <option value="">Без кастомной роли</option>
                            {customRoles.map((role) => (
                              <option key={role.key} value={role.key}>
                                {role.label}
                              </option>
                            ))}
                          </select>
                          {editRole === "manager" ? (
                            <select value={editManagerLevel} onChange={(event) => setEditManagerLevel(event.target.value as "regular" | "senior")}>
                              <option value="regular">Обычный бригадир</option>
                              <option value="senior">Старший бригадир</option>
                            </select>
                          ) : null}
                        </>
                      ) : (
                        <strong>{getDisplayRoleLabel(item)}</strong>
                      )}
                      {item.role === "manager" && item.managerProfileId && editUserId !== item.id ? (
                        <span>
                          Водители: {driverCountByManager.get(item.managerProfileId) ?? 0} · Машины:{" "}
                          {vehicleCountByManager.get(item.managerProfileId) ?? 0}
                        </span>
                      ) : null}
                      {roleRouteMap[item.role] && !roleActionMap[item.role]?.length && editUserId !== item.id ? (
                        <Link className="table-link" to={roleRouteMap[item.role]}>
                          Открыть раздел
                        </Link>
                      ) : null}
                      {roleActionMap[item.role]?.length && editUserId !== item.id ? (
                        <div className="users-table__role-links">
                          {roleActionMap[item.role].map((action) => (
                            <Link key={action.to} className="inline-pill inline-pill--accent" to={action.to}>
                              {action.label}
                            </Link>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    {editUserId === item.id ? (
                      <select value={editStatus} onChange={(event) => setEditStatus(event.target.value)}>
                        <option value="active">Активный</option>
                        <option value="blocked">Заблокирован</option>
                        <option value="invited">Приглашён</option>
                      </select>
                    ) : (
                      <span className={getStatusTone(item.status)}>{getStatusLabel(item.status)}</span>
                    )}
                  </td>
                  <td>
                    <div className="identity-cell">
                      {editUserId === item.id ? (
                        <label className="checkbox-row">
                          <input type="checkbox" checked={editMfaEnabled} onChange={(event) => setEditMfaEnabled(event.target.checked)} />
                          <span>{editMfaEnabled ? "Включена" : "Выключена"}</span>
                        </label>
                      ) : (
                        <strong>{item.mfaEnabled ? "Включена" : "Выключена"}</strong>
                      )}
                      {!item.mfaEnabled && editUserId !== item.id ? (
                        <Link className="table-link" to="/settings">
                          Открыть настройки
                        </Link>
                      ) : null}
                    </div>
                  </td>
                  <td>
                    <div className="identity-cell users-table__actions">
                      {editUserId === item.id ? (
                        <div className="toolbar">
                          <button type="button" disabled={editSaving} onClick={() => void handleSaveEdit()}>
                            {editSaving ? "Сохраняем..." : "Сохранить"}
                          </button>
                          <button type="button" onClick={handleCancelEdit}>
                            Отменить
                          </button>
                        </div>
                      ) : (
                        <div className="toolbar">
                          <button type="button" title="Редактировать пользователя" onClick={() => handleStartEdit(item)}>
                            Править
                          </button>
                          <button type="button" title="Удалить пользователя" disabled={deletingUserId === item.id} onClick={() => void handleArchiveUser(item)}>
                            {deletingUserId === item.id ? "Удаляем..." : "Удалить"}
                          </button>
                        </div>
                      )}
                      {editUserId === item.id && editMessage ? <span>{editMessage}</span> : null}
                    </div>
                  </td>
                </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </AsyncState>
    </section>
  );
}
