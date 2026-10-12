-- AlterEnum
ALTER TYPE "DeviceKind" ADD VALUE 'GATE_SENSOR';

-- CreateEnum
CREATE TYPE "QuantityRule" AS ENUM ('PER_BAJADA', 'PER_PUMP', 'FIXED');

-- CreateTable
CREATE TABLE "hardware_products" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "device_kind" "DeviceKind",
    "quantity_rule" "QuantityRule" NOT NULL,
    "fixed_quantity" INTEGER,
    "unit_price" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hardware_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hardware_products_code_key" ON "hardware_products"("code");

-- Unicidad de dispositivos no retirados:
-- FLOW_METER / RFID_READER: uno por (tambo, kind, bajada)
-- VACUUM_PUMP_SENSOR / GATE_SENSOR (sin bajada): uno por (tambo, kind, label normalizado)
-- El filtro es bajada_number IS NULL para no usar el valor nuevo GATE_SENSOR
-- en la misma transacción que ALTER TYPE (PostgreSQL lo rechaza).
CREATE UNIQUE INDEX devices_one_active_per_bajada
  ON devices (tambo_id, kind, bajada_number)
  WHERE retired_at IS NULL
    AND bajada_number IS NOT NULL;

CREATE UNIQUE INDEX devices_one_active_per_label
  ON devices (tambo_id, kind, (COALESCE(lower(btrim(label)), '')))
  WHERE retired_at IS NULL
    AND bajada_number IS NULL;
