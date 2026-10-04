-- CreateEnum
CREATE TYPE "TamboRequestStatus" AS ENUM ('SENT', 'QUOTED', 'ACCEPTED', 'DECLINED', 'REJECTED', 'CANCELLED', 'CONVERTED');

-- AlterTable
ALTER TABLE "tambos" ADD COLUMN "activated_at" TIMESTAMP(3);

-- Backfill: tambos existentes siguen activos y facturables
UPDATE "tambos" SET "activated_at" = "createdAt" WHERE "activated_at" IS NULL;

-- CreateTable
CREATE TABLE "tambo_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "requested_by_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "bajada_count" INTEGER NOT NULL,
    "hardware" JSONB NOT NULL,
    "equipment_list" JSONB NOT NULL,
    "service_provider_id" UUID,
    "notes" TEXT,
    "status" "TamboRequestStatus" NOT NULL DEFAULT 'SENT',
    "quote_items" JSONB,
    "quote_total" DECIMAL(12,2),
    "quote_currency" TEXT,
    "quote_valid_until" TIMESTAMP(3),
    "quote_notes" TEXT,
    "quoted_by_id" UUID,
    "quoted_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "tambo_id" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tambo_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tambo_requests_tambo_id_key" ON "tambo_requests"("tambo_id");

-- CreateIndex
CREATE INDEX "tambo_requests_tenant_id_status_idx" ON "tambo_requests"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "tambo_requests_service_provider_id_status_idx" ON "tambo_requests"("service_provider_id", "status");

-- AddForeignKey
ALTER TABLE "tambo_requests" ADD CONSTRAINT "tambo_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tambo_requests" ADD CONSTRAINT "tambo_requests_requested_by_id_fkey" FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tambo_requests" ADD CONSTRAINT "tambo_requests_quoted_by_id_fkey" FOREIGN KEY ("quoted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tambo_requests" ADD CONSTRAINT "tambo_requests_service_provider_id_fkey" FOREIGN KEY ("service_provider_id") REFERENCES "service_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tambo_requests" ADD CONSTRAINT "tambo_requests_tambo_id_fkey" FOREIGN KEY ("tambo_id") REFERENCES "tambos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
