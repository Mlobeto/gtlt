-- AlterTable
ALTER TABLE "part_types" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "part_types" ADD COLUMN "default_life_months" INTEGER;
ALTER TABLE "part_types" ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "part_instances" ADD COLUMN "installed_at_approx" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tenant_part_type_configs" ALTER COLUMN "usage_threshold" DROP NOT NULL;
ALTER TABLE "tenant_part_type_configs" ADD COLUMN "life_months" INTEGER;
