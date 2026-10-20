-- AlterTable
ALTER TABLE "tambos" ADD COLUMN "delivery_diff_threshold_pct" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "milk_deliveries" ADD COLUMN "pickup_date" DATE,
ADD COLUMN "pickup_shift" "MilkingShift",
ADD COLUMN "guachera_liters" DECIMAL(12,2),
ADD COLUMN "ticket_photo_url" TEXT;

-- CreateIndex
CREATE INDEX "milk_deliveries_tambo_id_pickup_date_pickup_shift_idx"
  ON "milk_deliveries"("tambo_id", "pickup_date", "pickup_shift");

CREATE UNIQUE INDEX milk_deliveries_one_active_per_pickup
  ON milk_deliveries (tambo_id, pickup_date, pickup_shift)
  WHERE status = 'ACTIVE'
    AND pickup_date IS NOT NULL;
