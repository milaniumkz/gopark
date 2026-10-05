import { NavLink, Outlet, useLocation } from "react-router-dom";
import { crmNavigationItems, hasCrmAccess } from "../lib/crm-access";
import { useAuth } from "./AuthContext";
import type { CrmRouteKey } from "../lib/crm-access";
import { useRef, useState } from "react";
import type { SettingsOverview } from "@gopark/contracts";
import { useApiQuery } from "../hooks/useApiQuery";
import {
  BellIcon,
  CarIcon,
  ContractsIcon,
  DashboardIcon,
  DriversIcon,
  FinanceIcon,
  IncidentIcon,
  LedgerIcon,
  OutboxIcon,
  PaymentsIcon,
  ReportsIcon,
  SettingsIcon,
  ShieldIcon,
  UsersSettingsIcon,
  WalletIcon,
} from "./CrmIcons";
import { BlockLayoutSettings } from "./BlockLayoutSettings";

const routeIcons: Record<CrmRouteKey, typeof DashboardIcon> = {
  dashboard: DashboardIcon,
  vehicles: CarIcon,
  "vehicle-detail": CarIcon,
  drivers: DriversIcon,
  "driver-detail": DriversIcon,
  contracts: ContractsIcon,
  "contract-detail": ContractsIcon,
  payments: PaymentsIcon,
  service: CarIcon,
  parts: FinanceIcon,
  "insurance-gps": ShieldIcon,
  inspections: IncidentIcon,
  fines: FinanceIcon,
  blacklist: ShieldIcon,
  writeoffs: FinanceIcon,
  imports: ReportsIcon,
  payouts: WalletIcon,
  ledger: LedgerIcon,
  "financial-ops": FinanceIcon,
  incidents: IncidentIcon,
  notifications: BellIcon,
  chats: BellIcon,
  support: ShieldIcon,
  reports: ReportsIcon,
  audit: ShieldIcon,
  outbox: OutboxIcon,
  users: UsersSettingsIcon,
  settings: SettingsIcon,
};

const roleLabels: Record<string, string> = {
  owner: "Владелец",
  admin: "Администратор",
  finance: "Финансы",
  manager: "Бригадир",
  operator: "Оператор",
  auditor: "Аудитор",
};

export function AppLayout() {
  const location = useLocation();
  const pageRef = useRef<HTMLElement | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => localStorage.getItem("gopark.crm.sidebar") !== "closed");
  const { session, signOut } = useAuth();
  const settingsApi = useApiQuery<SettingsOverview>("settings/overview");
  const roleAccess = settingsApi.data?.crmRoleAccess ?? null;
  const navigation = crmNavigationItems.filter((item) => hasCrmAccess(session.requestUserRole, item.key, roleAccess, session.customRoleKey));
  const activeItem =
    navigation.find((item) =>
      item.to === "/"
        ? location.pathname === "/"
        : location.pathname === item.to || location.pathname.startsWith(`${item.to}/`),
    ) ?? navigation[0] ?? crmNavigationItems[0];

  return (
    <div className={`shell shell--immersive${isSidebarOpen ? "" : " shell--sidebar-collapsed"}`}>
      <aside className="sidebar">
        <div className="sidebar__body">
          <div className="brand">
            <div className="brand__logo">
              <img src="/gopark-logo.png" alt="GoPark" />
            </div>
            <div className="brand__copy">
              <h1>GoPark</h1>
              <p>Рабочий кабинет</p>
            </div>
            <button
              type="button"
              className="sidebar-toggle-top"
              title="Скрыть меню"
              onClick={() => {
                localStorage.setItem("gopark.crm.sidebar", "closed");
                setIsSidebarOpen(false);
              }}
            >
              ×
            </button>
          </div>
          <div className="mode-card">
            <div className="mode-card__icon mode-card__icon--logo">
              <img src="/gopark-logo.png" alt="GoPark" />
            </div>
            <div className="mode-card__copy">
              <span className="mode-card__eyebrow">GoPark</span>
              <strong>GoPark</strong>
              <p>Водители, автомобили, договоры и выплаты.</p>
            </div>
          </div>
          <div className="nav-group">
            <span className="nav-group__label">Основная навигация</span>
          </div>
          <nav className="nav">
            {navigation.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) => `nav__link${isActive ? " nav__link--active" : ""}`}
              >
                <span className="nav__icon">
                  {(() => {
                    const Icon = routeIcons[item.key];
                    return <Icon width={18} height={18} />;
                  })()}
                </span>
                <span className="nav__label">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="sidebar-footer">
          <button
            type="button"
            className="sidebar-footer__button"
            onClick={() =>
              setIsSidebarOpen((value) => {
                const next = !value;
                localStorage.setItem("gopark.crm.sidebar", next ? "open" : "closed");
                return next;
              })
            }
          >
            Скрыть меню
          </button>
          <NavLink
            to="/notifications"
            className={({ isActive }) =>
              `sidebar-footer__button sidebar-footer__button--link${isActive ? " sidebar-footer__button--active" : ""}`
            }
          >
            <BellIcon width={16} height={16} />
            <span>Оповещения</span>
          </NavLink>
          <BlockLayoutSettings contentRef={pageRef} routeKey={location.pathname} routeLabel={activeItem.label} />
          <div className="user-pill user-pill--sidebar">
            <div className="user-pill__avatar">{session.requestUserRole.slice(0, 2).toUpperCase()}</div>
            <div className="user-pill__copy">
              <strong>{roleLabels[session.requestUserRole] ?? session.requestUserRole}</strong>
              <span>{session.companyName?.trim() ? session.companyName : "Доступ"}</span>
            </div>
          </div>
          <button
            className="sidebar-footer__button sidebar-footer__button--primary"
            onClick={() => {
              void signOut();
            }}
          >
            Выйти
          </button>
        </div>
      </aside>
      <div className="content">
        {!isSidebarOpen ? (
          <button
            type="button"
            className="sidebar-reopen"
            onClick={() =>
              setIsSidebarOpen(() => {
                localStorage.setItem("gopark.crm.sidebar", "open");
                return true;
              })
            }
          >
            Меню
          </button>
        ) : null}
        <main className="page" ref={pageRef}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
