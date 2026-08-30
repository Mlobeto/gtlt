-- CreateEnum
CREATE TYPE "ServiceRequestUrgency" AS ENUM ('NORMAL', 'URGENT');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('SERVICE_REQUESTED', 'SERVICE_PENDING_APPROVAL', 'SERVICE_APPROVED', 'SERVICE_REJECTED');

-- AlterEnum
ALTER TYPE "ServiceRequestStatus" ADD VALUE 'PENDING_APPROVAL';

-- AlterTable
ALTER TABLE "service_requests" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by_id" UUID,
ADD COLUMN     "urgency" "ServiceRequestUrgency" NOT NULL DEFAULT 'NORMAL';

-- AlterTable
ALTER TABLE "tambos" ADD COLUMN     "service_requires_owner_approval" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "tambo_id" UUID,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "read_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_tenant_id_user_id_read_at_createdAt_idx" ON "notifications"("tenant_id", "user_id", "read_at", "createdAt");

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tambo_id_fkey" FOREIGN KEY ("tambo_id") REFERENCES "tambos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
