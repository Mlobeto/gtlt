-- CreateEnum
CREATE TYPE "PartFieldKind" AS ENUM ('TEXT', 'NUMBER', 'SELECT', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "PowerSupply" AS ENUM ('MONOPHASE', 'THREEPHASE');

-- AlterTable
ALTER TABLE "tambos" ADD COLUMN "power_supply" "PowerSupply";

-- AlterTable
ALTER TABLE "tambo_requests" ADD COLUMN "power_supply" "PowerSupply";

-- AlterTable
ALTER TABLE "part_instances" ADD COLUMN "attributes" JSONB NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "part_type_fields" (
    "id" UUID NOT NULL,
    "part_type_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "PartFieldKind" NOT NULL,
    "unit" TEXT,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "min" DECIMAL(14,4),
    "max" DECIMAL(14,4),
    "help_text" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "part_type_fields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "part_type_fields_part_type_id_key_key" ON "part_type_fields"("part_type_id", "key");

-- CreateIndex
CREATE INDEX "part_type_fields_part_type_id_sort_order_idx" ON "part_type_fields"("part_type_id", "sort_order");

-- AddForeignKey
ALTER TABLE "part_type_fields" ADD CONSTRAINT "part_type_fields_part_type_id_fkey" FOREIGN KEY ("part_type_id") REFERENCES "part_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill attributes from leftover cold-equipment rows (table stays).
UPDATE "part_instances" AS pi
SET "attributes" = jsonb_strip_nulls(jsonb_build_object(
  'brand', NULLIF(ced.brand, ''),
  'model', NULLIF(ced.model, ''),
  'tank_capacity_l', ced.capacity_liters,
  'cooling_capacity', NULLIF(ced.cooling_capacity, ''),
  'controller_model', NULLIF(ced.controller_model, '')
))
FROM "cold_equipment_details" AS ced
WHERE ced.part_instance_id = pi.id;
