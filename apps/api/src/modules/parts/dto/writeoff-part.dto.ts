export interface WriteoffPartDto {
  partId: string;
  carId?: string | null;
  quantity: number;
  reason?: string | null;
  note?: string | null;
}
