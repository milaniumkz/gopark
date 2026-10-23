export interface WriteoffPartDto {
  partId: string;
  carId?: string | null;
  quantity: number;
  requesterCompany?: string | null;
  reason?: string | null;
  note?: string | null;
}
