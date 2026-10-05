export interface BlockLayoutItemConfig {
  hidden: boolean;
  order: number;
  key: string;
}

export type BlockLayoutRouteConfig = Record<string, BlockLayoutItemConfig[]>;

const STORAGE_KEY = "gopark.crm.block-layout";

function readStorage(): Record<string, BlockLayoutRouteConfig> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, BlockLayoutRouteConfig> | null;

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorage(value: Record<string, BlockLayoutRouteConfig>) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function loadRouteBlockLayout(pathname: string): BlockLayoutRouteConfig {
  return readStorage()[pathname] ?? {};
}

export function saveRouteBlockLayout(pathname: string, config: BlockLayoutRouteConfig) {
  const current = readStorage();
  current[pathname] = config;
  writeStorage(current);
}

export function resetRouteBlockLayout(pathname: string) {
  const current = readStorage();
  delete current[pathname];
  writeStorage(current);
}
