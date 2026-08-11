-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING', 'ACTIVE');

-- CreateEnum
CREATE TYPE "ServiceRequestCategory" AS ENUM ('VACUUM_PUMP', 'COLD_EQUIPMENT', 'MILKING_GROUP', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceRequestStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'TECNICO';

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "company_name" TEXT,
ADD COLUMN     "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateTable
CREATE TABLE "service_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tambo_id" UUID NOT NULL,
    "category" "ServiceRequestCategory" NOT NULL,
    "related_part_instance_id" UUID,
    "description" TEXT NOT NULL,
    "status" "ServiceRequestStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_technician_user_id" UUID,
    "created_by_id" UUID NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_requests_tenant_id_tambo_id_status_idx" ON "service_requests"("tenant_id", "tambo_id", "status");

-- CreateIndex
CREATE INDEX "service_requests_tenant_id_assigned_technician_user_id_stat_idx" ON "service_requests"("tenant_id", "assigned_technician_user_id", "status");

-- CreateIndex
CREATE INDEX "service_requests_related_part_instance_id_idx" ON "service_requests"("related_part_instance_id");

-- CreateIndex
CREATE INDEX "memberships_tenant_id_status_idx" ON "memberships"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_tambo_id_fkey" FOREIGN KEY ("tambo_id") REFERENCES "tambos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_related_part_instance_id_fkey" FOREIGN KEY ("related_part_instance_id") REFERENCES "part_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_assigned_technician_user_id_fkey" FOREIGN KEY ("assigned_technician_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
