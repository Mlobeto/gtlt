-- AlterTable
ALTER TABLE "part_types" ADD COLUMN "allows_multiple" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "part_types" ADD COLUMN "quantity_per_instance" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "part_instances" ADD COLUMN "label" TEXT;

-- Replace tambo-level unique so repeatable types can coexist by label.
DROP INDEX IF EXISTS part_instances_one_active_tambo_level;
CREATE UNIQUE INDEX part_instances_one_active_tambo_level
  ON part_instances (tambo_id, part_type_id, (COALESCE(lower(btrim(label)), '')))
  WHERE replaced_at IS NULL AND bajada_number IS NULL;
