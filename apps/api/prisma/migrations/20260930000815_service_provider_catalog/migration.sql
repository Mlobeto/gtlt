-- AlterTable
ALTER TABLE "service_requests" ADD COLUMN     "service_provider_id" UUID;

-- AlterTable
ALTER TABLE "tambos" ADD COLUMN     "default_service_provider_id" UUID;

-- CreateTable
CREATE TABLE "service_providers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_providers_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "tambos" ADD CONSTRAINT "tambos_default_service_provider_id_fkey" FOREIGN KEY ("default_service_provider_id") REFERENCES "service_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_service_provider_id_fkey" FOREIGN KEY ("service_provider_id") REFERENCES "service_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
