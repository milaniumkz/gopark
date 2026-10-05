export interface CreatePartDto {
  name: string;
  sku?: string | null;
  make?: string | null;
  model?: string | null;
  productionYear?: number | null;
  unit?: string | null;
  quantity?: number | null;
  minQuantity?: number | null;
  unitPrice?: number | null;
  supplier?: string | null;
  note?: string | null;
}
