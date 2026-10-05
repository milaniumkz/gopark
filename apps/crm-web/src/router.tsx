import type { ReactElement } from "react";
import { createBrowserRouter } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { AppLayout } from "./ui/AppLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { VehiclesPage } from "./pages/VehiclesPage";
import { DriversPage } from "./pages/DriversPage";
import { DriverDetailPage } from "./pages/DriverDetailPage";
import { ContractsPage } from "./pages/ContractsPage";
import { PaymentsPage } from "./pages/PaymentsPage";
import { ServicePage } from "./pages/ServicePage";
import { PartsPage } from "./pages/PartsPage";
import { InsuranceGpsPage } from "./pages/InsuranceGpsPage";
import { InspectionPage } from "./pages/InspectionPage";
import { FinesPage } from "./pages/FinesPage";
import { BlacklistPage } from "./pages/BlacklistPage";
import { WriteoffsPage } from "./pages/WriteoffsPage";
import { ImportsPage } from "./pages/ImportsPage";
import { PayoutsPage } from "./pages/PayoutsPage";
import { LedgerPage } from "./pages/LedgerPage";
import { ReportsPage } from "./pages/ReportsPage";
import { UsersPage } from "./pages/UsersPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AuditPage } from "./pages/AuditPage";
import { OutboxPage } from "./pages/OutboxPage";
import { FinancialOpsPage } from "./pages/FinancialOpsPage";
import { IncidentsPage } from "./pages/IncidentsPage";
import { ContractDetailPage } from "./pages/ContractDetailPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { VehicleDetailPage } from "./pages/VehicleDetailPage";
import { SupportPage } from "./pages/SupportPage";
import { ChatsPage } from "./pages/ChatsPage";
import { RoleGate } from "./ui/RoleGate";
import { crmNavigationItems, hasCrmAccess } from "./lib/crm-access";
import { useAuth } from "./ui/AuthContext";
import { RouteEntityModal } from "./ui/RouteEntityModal";

function withRoleGate(routeKey: import("./lib/crm-access").CrmRouteKey, element: ReactElement) {
  return <RoleGate routeKey={routeKey}>{element}</RoleGate>;
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
