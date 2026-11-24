ALTER TABLE "part_movements" ADD COLUMN "incident_id" UUID, ADD COLUMN "expense_id" TEXT;
ALTER TABLE "part_movements" ADD CONSTRAINT "part_movements_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "part_movements_incident_id_expense_id_type_key" ON "part_movements"("incident_id","expense_id","type");
CREATE INDEX "part_movements_incident_id_idx" ON "part_movements"("incident_id");
