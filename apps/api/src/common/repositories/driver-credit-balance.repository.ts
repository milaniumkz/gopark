export interface DriverCreditBalanceRepository {
  getByDriver(driverId: string): Promise<number>;
  getByDrivers(driverIds: string[]): Promise<Record<string, number>>;
  addCredit(driverId: string, amount: number): Promise<number>;
}
