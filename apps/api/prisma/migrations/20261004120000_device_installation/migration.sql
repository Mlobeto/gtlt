-- AlterTable
ALTER TABLE "devices" ADD COLUMN "retired_at" TIMESTAMP(3),
ADD COLUMN "created_by_id" UUID;

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN "can_install_devices" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
