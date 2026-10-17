-- AlterTable
ALTER TABLE "service_providers"
  ADD COLUMN "has_panel" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "contact_name" TEXT,
  ADD COLUMN "contact_phone" TEXT,
  ADD COLUMN "created_by_id" UUID;

-- AlterTable
ALTER TABLE "service_requests"
  ADD COLUMN "performed_by" TEXT,
  ADD COLUMN "resolution_notes" TEXT,
  ADD COLUMN "provider_notified_at" TIMESTAMP(3),
  ADD COLUMN "provider_notify_channel" TEXT;

-- Recreate FK: borrar una cuenta no convierte sus privadas en socias
ALTER TABLE "service_providers" DROP CONSTRAINT "service_providers_tenant_id_fkey";
ALTER TABLE "service_providers" ADD CONSTRAINT "service_providers_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "service_providers" ADD CONSTRAINT "service_providers_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
