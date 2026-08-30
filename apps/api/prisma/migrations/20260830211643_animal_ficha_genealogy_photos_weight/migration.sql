-- CreateEnum
CREATE TYPE "AnimalPhotoType" AS ENUM ('PROFILE', 'CONSULT');

-- CreateEnum
CREATE TYPE "WeightMethod" AS ENUM ('SCALE', 'TAPE', 'VISUAL_ESTIMATE');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ANIMAL_PHOTO_CONSULT';

-- AlterTable
ALTER TABLE "animals" ADD COLUMN     "breed" TEXT,
ADD COLUMN     "mother_id" UUID,
ADD COLUMN     "sire_id" UUID;

-- AlterTable
ALTER TABLE "repro_events" ADD COLUMN     "sire_id" UUID;

-- CreateTable
CREATE TABLE "sires" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "registration_code" TEXT,
    "is_external" BOOLEAN NOT NULL DEFAULT true,
    "linked_animal_id" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animal_photos" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tambo_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "photo_url" TEXT NOT NULL,
    "type" "AnimalPhotoType" NOT NULL,
    "note" TEXT,
    "health_event_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_id" UUID,
    "taken_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "client_mutation_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "animal_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weight_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tambo_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "weight_kg" DECIMAL(6,2) NOT NULL,
    "method" "WeightMethod" NOT NULL DEFAULT 'VISUAL_ESTIMATE',
    "measured_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "client_mutation_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weight_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sires_tenant_id_idx" ON "sires"("tenant_id");

-- CreateIndex
CREATE INDEX "animal_photos_tenant_id_tambo_id_animal_id_type_idx" ON "animal_photos"("tenant_id", "tambo_id", "animal_id", "type");

-- CreateIndex
CREATE INDEX "animal_photos_tenant_id_tambo_id_type_reviewed_at_idx" ON "animal_photos"("tenant_id", "tambo_id", "type", "reviewed_at");

-- CreateIndex
CREATE INDEX "animal_photos_tenant_id_client_mutation_id_idx" ON "animal_photos"("tenant_id", "client_mutation_id");

-- CreateIndex
CREATE INDEX "weight_events_tenant_id_animal_id_measured_at_idx" ON "weight_events"("tenant_id", "animal_id", "measured_at");

-- CreateIndex
CREATE INDEX "weight_events_tenant_id_tambo_id_measured_at_idx" ON "weight_events"("tenant_id", "tambo_id", "measured_at");

-- CreateIndex
CREATE INDEX "weight_events_tenant_id_client_mutation_id_idx" ON "weight_events"("tenant_id", "client_mutation_id");

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_mother_id_fkey" FOREIGN KEY ("mother_id") REFERENCES "animals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_sire_id_fkey" FOREIGN KEY ("sire_id") REFERENCES "sires"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sires" ADD CONSTRAINT "sires_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sires" ADD CONSTRAINT "sires_linked_animal_id_fkey" FOREIGN KEY ("linked_animal_id") REFERENCES "animals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repro_events" ADD CONSTRAINT "repro_events_sire_id_fkey" FOREIGN KEY ("sire_id") REFERENCES "sires"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_photos" ADD CONSTRAINT "animal_photos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_photos" ADD CONSTRAINT "animal_photos_tambo_id_fkey" FOREIGN KEY ("tambo_id") REFERENCES "tambos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_photos" ADD CONSTRAINT "animal_photos_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_photos" ADD CONSTRAINT "animal_photos_health_event_id_fkey" FOREIGN KEY ("health_event_id") REFERENCES "health_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_photos" ADD CONSTRAINT "animal_photos_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_photos" ADD CONSTRAINT "animal_photos_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_events" ADD CONSTRAINT "weight_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_events" ADD CONSTRAINT "weight_events_tambo_id_fkey" FOREIGN KEY ("tambo_id") REFERENCES "tambos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_events" ADD CONSTRAINT "weight_events_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_events" ADD CONSTRAINT "weight_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
