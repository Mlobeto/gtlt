-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "service_provider_id" UUID;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_service_provider_id_fkey" FOREIGN KEY ("service_provider_id") REFERENCES "service_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
