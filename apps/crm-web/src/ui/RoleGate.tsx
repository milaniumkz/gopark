import type { ReactNode } from "react";
import type { CrmRouteKey } from "../lib/crm-access";
import { hasCrmAccess } from "../lib/crm-access";
import { useAuth } from "./AuthContext";
import { AccessDeniedPage } from "./AccessDeniedPage";
import { useApiQuery } from "../hooks/useApiQuery";
import type { SettingsOverview } from "@gopark/contracts";

export function RoleGate({
  routeKey,
  children,
}: {
  routeKey: CrmRouteKey;
  children: ReactNode;
}) {
  const { session } = useAuth();
  const settingsApi = useApiQuery<SettingsOverview>("settings/overview");

  if (!hasCrmAccess(session.requestUserRole, routeKey, settingsApi.data?.crmRoleAccess ?? null, session.customRoleKey)) {
    return <AccessDeniedPage />;
  }

  return <>{children}</>;
}
