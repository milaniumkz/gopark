import { Component, lazy, Suspense, type ReactElement, type ReactNode } from "react";
import { createBrowserRouter } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { AppLayout } from "./ui/AppLayout";
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((module) => ({ default: module.DashboardPage })));
const VehiclesPage = lazy(() => import("./pages/VehiclesPage").then((module) => ({ default: module.VehiclesPage })));
const DriversPage = lazy(() => import("./pages/DriversPage").then((module) => ({ default: module.DriversPage })));
const DriverDetailPage = lazy(() => import("./pages/DriverDetailPage").then((module) => ({ default: module.DriverDetailPage })));
const ContractsPage = lazy(() => import("./pages/ContractsPage").then((module) => ({ default: module.ContractsPage })));
const PaymentsPage = lazy(() => import("./pages/PaymentsPage").then((module) => ({ default: module.PaymentsPage })));
const ServicePage = lazy(() => import("./pages/ServicePage").then((module) => ({ default: module.ServicePage })));
const PartsPage = lazy(() => import("./pages/PartsPage").then((module) => ({ default: module.PartsPage })));
const InsuranceGpsPage = lazy(() => import("./pages/InsuranceGpsPage").then((module) => ({ default: module.InsuranceGpsPage })));
const InspectionPage = lazy(() => import("./pages/InspectionPage").then((module) => ({ default: module.InspectionPage })));
const FinesPage = lazy(() => import("./pages/FinesPage").then((module) => ({ default: module.FinesPage })));
const BlacklistPage = lazy(() => import("./pages/BlacklistPage").then((module) => ({ default: module.BlacklistPage })));
const WriteoffsPage = lazy(() => import("./pages/WriteoffsPage").then((module) => ({ default: module.WriteoffsPage })));
const ImportsPage = lazy(() => import("./pages/ImportsPage").then((module) => ({ default: module.ImportsPage })));
const PayoutsPage = lazy(() => import("./pages/PayoutsPage").then((module) => ({ default: module.PayoutsPage })));
const LedgerPage = lazy(() => import("./pages/LedgerPage").then((module) => ({ default: module.LedgerPage })));
const ReportsPage = lazy(() => import("./pages/ReportsPage").then((module) => ({ default: module.ReportsPage })));
const UsersPage = lazy(() => import("./pages/UsersPage").then((module) => ({ default: module.UsersPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((module) => ({ default: module.SettingsPage })));
const AuditPage = lazy(() => import("./pages/AuditPage").then((module) => ({ default: module.AuditPage })));
const OutboxPage = lazy(() => import("./pages/OutboxPage").then((module) => ({ default: module.OutboxPage })));
const FinancialOpsPage = lazy(() => import("./pages/FinancialOpsPage").then((module) => ({ default: module.FinancialOpsPage })));
const IncidentsPage = lazy(() => import("./pages/IncidentsPage").then((module) => ({ default: module.IncidentsPage })));
const ContractDetailPage = lazy(() => import("./pages/ContractDetailPage").then((module) => ({ default: module.ContractDetailPage })));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage").then((module) => ({ default: module.NotificationsPage })));
const VehicleDetailPage = lazy(() => import("./pages/VehicleDetailPage").then((module) => ({ default: module.VehicleDetailPage })));
const SupportPage = lazy(() => import("./pages/SupportPage").then((module) => ({ default: module.SupportPage })));
const ChatsPage = lazy(() => import("./pages/ChatsPage").then((module) => ({ default: module.ChatsPage })));
import { RoleGate } from "./ui/RoleGate";
import { crmNavigationItems, hasCrmAccess } from "./lib/crm-access";
import { useAuth } from "./ui/AuthContext";
import { RouteEntityModal } from "./ui/RouteEntityModal";

class PageLoadBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div role="alert" style={{ padding: 24 }}>
      <p>Не удалось загрузить раздел. Проверьте соединение или обновите страницу.</p>
      <button type="button" onClick={() => window.location.reload()}>Обновить страницу</button>
    </div>;
    return this.props.children;
  }
}

function withRoleGate(routeKey: import("./lib/crm-access").CrmRouteKey, element: ReactElement) {
  return <RoleGate routeKey={routeKey}><PageLoadBoundary key={routeKey}><Suspense fallback={<div role="status" style={{ padding: 24 }}>Загрузка раздела…</div>}>{element}</Suspense></PageLoadBoundary></RoleGate>;
}

function CrmHomeRedirect() {
  const { session } = useAuth();
  const fallback = crmNavigationItems.find((item) => hasCrmAccess(session.requestUserRole, item.key));
  return <Navigate to={fallback?.to ?? "/"} replace />;
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <CrmHomeRedirect /> },
      { path: "dashboard", element: withRoleGate("dashboard", <DashboardPage />) },
      {
        path: "vehicles",
        element: withRoleGate("vehicles", <VehiclesPage />),
        children: [
          {
            path: ":carId",
            element: withRoleGate(
              "vehicle-detail",
              <RouteEntityModal
                title="Карточка автомобиля"
                subtitle="Автомобиль, водитель, договор и суммы открываются поверх реестра."
                closeTo="/vehicles"
              >
                <VehicleDetailPage />
              </RouteEntityModal>,
            ),
          },
        ],
      },
      {
        path: "drivers",
        element: withRoleGate("drivers", <DriversPage />),
        children: [
          {
            path: ":driverId",
            element: withRoleGate(
              "driver-detail",
              <RouteEntityModal
                title="Карточка водителя"
                subtitle="Профиль, статус, договоры и выплаты открываются поверх реестра."
                closeTo="/drivers"
              >
                <DriverDetailPage />
              </RouteEntityModal>,
            ),
          },
        ],
      },
      {
        path: "contracts",
        element: withRoleGate("contracts", <ContractsPage />),
        children: [
          {
            path: ":contractId",
            element: withRoleGate(
              "contract-detail",
              <RouteEntityModal
                title="Карточка договора"
                subtitle="График, долг и действия по договору открываются поверх реестра."
                closeTo="/contracts"
              >
                <ContractDetailPage />
              </RouteEntityModal>,
            ),
          },
        ],
      },
      { path: "payments", element: withRoleGate("payments", <PaymentsPage />) },
      { path: "service", element: withRoleGate("service", <ServicePage />) },
      { path: "parts", element: withRoleGate("parts", <PartsPage />) },
      { path: "insurance-gps", element: withRoleGate("insurance-gps", <InsuranceGpsPage />) },
      { path: "inspections", element: withRoleGate("inspections", <InspectionPage />) },
      { path: "fines", element: withRoleGate("fines", <FinesPage />) },
      { path: "blacklist", element: withRoleGate("blacklist", <BlacklistPage />) },
      { path: "writeoffs", element: withRoleGate("writeoffs", <WriteoffsPage />) },
      { path: "imports", element: withRoleGate("imports", <ImportsPage />) },
      { path: "payouts", element: withRoleGate("payouts", <PayoutsPage />) },
      { path: "ledger", element: withRoleGate("ledger", <LedgerPage />) },
      { path: "reports", element: withRoleGate("reports", <ReportsPage />) },
      { path: "financial-ops", element: withRoleGate("financial-ops", <FinancialOpsPage />) },
      { path: "incidents", element: withRoleGate("incidents", <IncidentsPage />) },
      { path: "notifications", element: withRoleGate("notifications", <NotificationsPage />) },
      { path: "chats", element: withRoleGate("chats", <ChatsPage />) },
      { path: "support", element: withRoleGate("support", <SupportPage />) },
      { path: "audit", element: withRoleGate("audit", <AuditPage />) },
      { path: "outbox", element: withRoleGate("outbox", <OutboxPage />) },
      { path: "users", element: withRoleGate("users", <UsersPage />) },
      { path: "settings", element: withRoleGate("settings", <SettingsPage />) },
    ],
  },
]);
