CREATE TABLE "manager_calendar_comments" (
    "id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "comment" TEXT NOT NULL,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "manager_calendar_comments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "manager_calendar_comments_driver_id_date_key" ON "manager_calendar_comments"("driver_id", "date");
CREATE INDEX "manager_calendar_comments_date_idx" ON "manager_calendar_comments"("date");
ALTER TABLE "manager_calendar_comments" ADD CONSTRAINT "manager_calendar_comments_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "manager_calendar_comments" ADD CONSTRAINT "manager_calendar_comments_updated_by_user_id_fkey" FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "users" ADD COLUMN "middle_name" TEXT;
