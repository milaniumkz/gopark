export interface ReceivePartDto {
  partId?: string | null;
  name?: string | null;
  sku?: string | null;
  make?: string | null;
  model?: string | null;
  productionYear?: number | null;
  unit?: string | null;
  quantity: number;
  minQuantity?: number | null;
  unitPrice?: number | null;
  supplier?: string | null;
  note?: string | null;
}
