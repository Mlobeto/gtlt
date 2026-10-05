-- CreateEnum
CREATE TYPE "WorkReportStatus" AS ENUM ('DRAFT', 'SUBMITTED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'WORK_REPORT_SUBMITTED';

-- CreateTable
CREATE TABLE "work_reports" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tambo_id" UUID NOT NULL,
    "service_request_id" UUID,
    "author_id" UUID NOT NULL,
    "author_role" TEXT NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "tasks" JSONB NOT NULL DEFAULT '[]',
    "hours_worked" DECIMAL(6,2),
    "measurements" JSONB NOT NULL DEFAULT '[]',
    "photo_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "WorkReportStatus" NOT NULL DEFAULT 'DRAFT',
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_reports_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "part_instances" ADD COLUMN "installed_in_report_id" UUID;

-- CreateIndex
CREATE INDEX "work_reports_tenant_id_tambo_id_performed_at_idx" ON "work_reports"("tenant_id", "tambo_id", "performed_at");

-- CreateIndex
CREATE INDEX "work_reports_service_request_id_idx" ON "work_reports"("service_request_id");

-- CreateIndex
CREATE INDEX "part_instances_installed_in_report_id_idx" ON "part_instances"("installed_in_report_id");

-- AddForeignKey
ALTER TABLE "work_reports" ADD CONSTRAINT "work_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_reports" ADD CONSTRAINT "work_reports_tambo_id_fkey" FOREIGN KEY ("tambo_id") REFERENCES "tambos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_reports" ADD CONSTRAINT "work_reports_service_request_id_fkey" FOREIGN KEY ("service_request_id") REFERENCES "service_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_reports" ADD CONSTRAINT "work_reports_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_instances" ADD CONSTRAINT "part_instances_installed_in_report_id_fkey" FOREIGN KEY ("installed_in_report_id") REFERENCES "work_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;
