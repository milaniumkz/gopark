ALTER TABLE "part_movements" ADD COLUMN "requester_company" TEXT;
CREATE INDEX "part_movements_requester_company_idx" ON "part_movements"("requester_company");
