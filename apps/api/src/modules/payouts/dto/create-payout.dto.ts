export interface CreatePayoutDto {
  driverId: string;
  amount: number;
  payoutDestination?: string | null;
}
