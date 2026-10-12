-- AlterTable
ALTER TABLE "users" ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tambos" ADD COLUMN "planned_equipment" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "pump_count" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "service_providers" ADD COLUMN "tenant_id" UUID;

-- CreateTable
CREATE TABLE "tambo_service_provider_periods" (
    "id" UUID NOT NULL,
    "tambo_id" UUID NOT NULL,
    "service_provider_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "started_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tambo_service_provider_periods_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tambo_service_provider_periods_tambo_id_started_at_idx"
  ON "tambo_service_provider_periods"("tambo_id", "started_at");

CREATE UNIQUE INDEX tambo_service_provider_periods_one_open
  ON tambo_service_provider_periods (tambo_id)
  WHERE ended_at IS NULL;

-- AddForeignKey
ALTER TABLE "service_providers" ADD CONSTRAINT "service_providers_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tambo_service_provider_periods" ADD CONSTRAINT "tambo_service_provider_periods_tambo_id_fkey"
  FOREIGN KEY ("tambo_id") REFERENCES "tambos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tambo_service_provider_periods" ADD CONSTRAINT "tambo_service_provider_periods_service_provider_id_fkey"
  FOREIGN KEY ("service_provider_id") REFERENCES "service_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tambo_service_provider_periods" ADD CONSTRAINT "tambo_service_provider_periods_started_by_id_fkey"
  FOREIGN KEY ("started_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Tambos existentes con proveedor: un período abierto desde createdAt
INSERT INTO "tambo_service_provider_periods" (
  "id", "tambo_id", "service_provider_id", "started_at", "ended_at", "created_at"
)
SELECT
  gen_random_uuid(),
  "id",
  "default_service_provider_id",
  "createdAt",
  NULL,
  NOW()
FROM "tambos"
WHERE "default_service_provider_id" IS NOT NULL;
