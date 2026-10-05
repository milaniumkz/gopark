export interface YandexBalanceSnapshot {
  driverId: string;
  amount: number;
  syncedAt: string;
}

export interface YandexBalanceRepository {
  getLatestByDriver(driverId: string): Promise<YandexBalanceSnapshot | null>;
  getLatestByDrivers(driverIds: string[]): Promise<Record<string, YandexBalanceSnapshot | null>>;
}
