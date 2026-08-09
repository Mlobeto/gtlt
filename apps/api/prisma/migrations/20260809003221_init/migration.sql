-- CreateEnum
CREATE TYPE "Role" AS ENUM ('TAMBERO', 'DUENIO', 'ADMIN', 'VETERINARIO');

-- CreateEnum
CREATE TYPE "AnimalStatus" AS ENUM ('ACTIVE', 'DRY', 'SOLD', 'DEAD');

-- CreateEnum
CREATE TYPE "MilkingShift" AS ENUM ('MORNING', 'AFTERNOON');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateEnum
CREATE TYPE "HealthEventType" AS ENUM ('MASTITIS', 'TREATMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ReproEventType" AS ENUM ('HEAT', 'SERVICE', 'EXPECTED_CALVING', 'CALVING', 'ABORTION', 'OTHER');

-- CreateEnum
CREATE TYPE "PartReplacementPattern" AS ENUM ('USAGE_BASED', 'REACTIVE', 'BRANDED');

-- CreateEnum
CREATE TYPE "ControlLecheroSource" AS ENUM ('EXTERNAL_TECHNICIAN', 'FLOW_METER');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tambos" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "bajada_count" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tambos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "password_hash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "roles" "Role"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membership_tambos" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "tambo_id" UUID NOT NULL,

    CONSTRAINT "membership_tambos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tambo_id" UUID NOT NULL,
    "ear_tag" TEXT NOT NULL,
    "status" "AnimalStatus" NOT NULL DEFAULT 'ACTIVE',
    "birth_date" DATE,
    "entered_at" DATE,
    "photo_url" TEXT,
    "electronic_id" TEXT,
    "notes" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "client_mutation_id" TEXT,
    "created_by_id" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "animals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "animal_transfer_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "from_tambo_id" UUID NOT NULL,
    "to_tambo_id" UUID NOT NULL,
    "transferred_at" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "client_mutation_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "animal_transfer_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milking_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tambo_id" UUID NOT NULL,
    "session_date" DATE NOT NULL,
    "shift" "MilkingShift" NOT NULL,
    "total_liters" DECIMAL(12,2) NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "corrects_session_id" UUID,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "client_mutation_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milking_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_lecheros" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tambo_id" UUID NOT NULL,
    "performed_at" TIMESTAMP(3) NOT NULL,
    "source" "ControlLecheroSource" NOT NULL DEFAULT 'EXTERNAL_TECHNICIAN',
    "technician_name" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "corrects_control_id" UUID,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "client_mutation_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "control_lecheros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "control_lechero_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tambo_id" UUID NOT NULL,
    "control_lechero_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "bajada_number" INTEGER NOT NULL,
    "liters" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "control_lechero_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milk_deliveries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tambo_id" UUID NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "cold_tank_liters" DECIMAL(12,2) NOT NULL,
    "truck_declared_liters" DECIMAL(12,2) NOT NULL,
    "cold_tank_temperature_c" DECIMAL(5,2),
    "truck_temperature_c" DECIMAL(5,2),
    "cold_equipment_instance_id" UUID,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "corrects_delivery_id" UUID,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "client_mutation_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "milk_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tambo_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "type" "HealthEventType" NOT NULL,
    "event_at" TIMESTAMP(3) NOT NULL,
    "product_name" TEXT,
    "milk_withdrawal_until" TIMESTAMP(3),
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "client_mutation_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "health_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repro_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tambo_id" UUID NOT NULL,
    "animal_id" UUID NOT NULL,
    "type" "ReproEventType" NOT NULL,
    "event_at" TIMESTAMP(3) NOT NULL,
    "expected_calving_at" DATE,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "client_mutation_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "repro_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pattern" "PartReplacementPattern" NOT NULL,
    "default_usage_threshold" INTEGER,
    "applies_per_bajada" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "part_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_part_type_configs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "part_type_id" UUID NOT NULL,
    "usage_threshold" INTEGER NOT NULL,

    CONSTRAINT "tenant_part_type_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_instances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tambo_id" UUID NOT NULL,
    "part_type_id" UUID NOT NULL,
    "bajada_number" INTEGER,
    "installed_at" TIMESTAMP(3) NOT NULL,
    "brand_model" TEXT,
    "photo_url" TEXT,
    "usage_counter" DECIMAL(14,2),
    "replaced_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by_id" UUID,
    "client_mutation_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "part_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cold_equipment_details" (
    "part_instance_id" UUID NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "capacity_liters" DECIMAL(12,2) NOT NULL,
    "cooling_capacity" TEXT NOT NULL,
    "controller_model" TEXT,

    CONSTRAINT "cold_equipment_details_pkey" PRIMARY KEY ("part_instance_id")
);

-- CreateIndex
CREATE INDEX "tambos_tenant_id_idx" ON "tambos"("tenant_id");

-- CreateIndex
CREATE INDEX "tambos_tenant_id_name_idx" ON "tambos"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_tenant_id_user_id_key" ON "memberships"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "membership_tambos_tenant_id_tambo_id_idx" ON "membership_tambos"("tenant_id", "tambo_id");

-- CreateIndex
CREATE UNIQUE INDEX "membership_tambos_membership_id_tambo_id_key" ON "membership_tambos"("membership_id", "tambo_id");

-- CreateIndex
CREATE INDEX "animals_tenant_id_tambo_id_status_idx" ON "animals"("tenant_id", "tambo_id", "status");

-- CreateIndex
CREATE INDEX "animals_tenant_id_tambo_id_ear_tag_idx" ON "animals"("tenant_id", "tambo_id", "ear_tag");

-- CreateIndex
CREATE INDEX "animals_tenant_id_tambo_id_updatedAt_idx" ON "animals"("tenant_id", "tambo_id", "updatedAt");

-- CreateIndex
CREATE INDEX "animals_tenant_id_client_mutation_id_idx" ON "animals"("tenant_id", "client_mutation_id");

-- CreateIndex
CREATE INDEX "animal_transfer_events_tenant_id_animal_id_transferred_at_idx" ON "animal_transfer_events"("tenant_id", "animal_id", "transferred_at");

-- CreateIndex
CREATE INDEX "animal_transfer_events_tenant_id_to_tambo_id_transferred_at_idx" ON "animal_transfer_events"("tenant_id", "to_tambo_id", "transferred_at");

-- CreateIndex
CREATE INDEX "animal_transfer_events_tenant_id_client_mutation_id_idx" ON "animal_transfer_events"("tenant_id", "client_mutation_id");

-- CreateIndex
CREATE INDEX "milking_sessions_tenant_id_tambo_id_session_date_idx" ON "milking_sessions"("tenant_id", "tambo_id", "session_date");

-- CreateIndex
CREATE INDEX "milking_sessions_tenant_id_tambo_id_createdAt_idx" ON "milking_sessions"("tenant_id", "tambo_id", "createdAt");

-- CreateIndex
CREATE INDEX "milking_sessions_corrects_session_id_idx" ON "milking_sessions"("corrects_session_id");

-- CreateIndex
CREATE INDEX "milking_sessions_tenant_id_client_mutation_id_idx" ON "milking_sessions"("tenant_id", "client_mutation_id");

-- CreateIndex
CREATE INDEX "control_lecheros_tenant_id_tambo_id_performed_at_idx" ON "control_lecheros"("tenant_id", "tambo_id", "performed_at");

-- CreateIndex
CREATE INDEX "control_lecheros_corrects_control_id_idx" ON "control_lecheros"("corrects_control_id");

-- CreateIndex
CREATE INDEX "control_lecheros_tenant_id_client_mutation_id_idx" ON "control_lecheros"("tenant_id", "client_mutation_id");

-- CreateIndex
CREATE INDEX "control_lechero_lines_control_lechero_id_idx" ON "control_lechero_lines"("control_lechero_id");

-- CreateIndex
CREATE INDEX "control_lechero_lines_tenant_id_tambo_id_animal_id_idx" ON "control_lechero_lines"("tenant_id", "tambo_id", "animal_id");

-- CreateIndex
CREATE INDEX "milk_deliveries_tenant_id_tambo_id_period_start_idx" ON "milk_deliveries"("tenant_id", "tambo_id", "period_start");

-- CreateIndex
CREATE INDEX "milk_deliveries_cold_equipment_instance_id_idx" ON "milk_deliveries"("cold_equipment_instance_id");

-- CreateIndex
CREATE INDEX "milk_deliveries_corrects_delivery_id_idx" ON "milk_deliveries"("corrects_delivery_id");

-- CreateIndex
CREATE INDEX "milk_deliveries_tenant_id_client_mutation_id_idx" ON "milk_deliveries"("tenant_id", "client_mutation_id");

-- CreateIndex
CREATE INDEX "health_events_tenant_id_tambo_id_milk_withdrawal_until_idx" ON "health_events"("tenant_id", "tambo_id", "milk_withdrawal_until");

-- CreateIndex
CREATE INDEX "health_events_tenant_id_tambo_id_event_at_idx" ON "health_events"("tenant_id", "tambo_id", "event_at");

-- CreateIndex
CREATE INDEX "health_events_tenant_id_animal_id_event_at_idx" ON "health_events"("tenant_id", "animal_id", "event_at");

-- CreateIndex
CREATE INDEX "health_events_tenant_id_tambo_id_updatedAt_idx" ON "health_events"("tenant_id", "tambo_id", "updatedAt");

-- CreateIndex
CREATE INDEX "health_events_tenant_id_client_mutation_id_idx" ON "health_events"("tenant_id", "client_mutation_id");

-- CreateIndex
CREATE INDEX "repro_events_tenant_id_tambo_id_event_at_idx" ON "repro_events"("tenant_id", "tambo_id", "event_at");

-- CreateIndex
CREATE INDEX "repro_events_tenant_id_animal_id_event_at_idx" ON "repro_events"("tenant_id", "animal_id", "event_at");

-- CreateIndex
CREATE INDEX "repro_events_tenant_id_tambo_id_updatedAt_idx" ON "repro_events"("tenant_id", "tambo_id", "updatedAt");

-- CreateIndex
CREATE INDEX "repro_events_tenant_id_client_mutation_id_idx" ON "repro_events"("tenant_id", "client_mutation_id");

-- CreateIndex
CREATE UNIQUE INDEX "part_types_code_key" ON "part_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_part_type_configs_tenant_id_part_type_id_key" ON "tenant_part_type_configs"("tenant_id", "part_type_id");

-- CreateIndex
CREATE INDEX "part_instances_tenant_id_tambo_id_replaced_at_idx" ON "part_instances"("tenant_id", "tambo_id", "replaced_at");

-- CreateIndex
CREATE INDEX "part_instances_tenant_id_tambo_id_bajada_number_part_type_i_idx" ON "part_instances"("tenant_id", "tambo_id", "bajada_number", "part_type_id");

-- CreateIndex
CREATE INDEX "part_instances_tenant_id_client_mutation_id_idx" ON "part_instances"("tenant_id", "client_mutation_id");

-- AddForeignKey
ALTER TABLE "tambos" ADD CONSTRAINT "tambos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_tambos" ADD CONSTRAINT "membership_tambos_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membership_tambos" ADD CONSTRAINT "membership_tambos_tambo_id_fkey" FOREIGN KEY ("tambo_id") REFERENCES "tambos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_tambo_id_fkey" FOREIGN KEY ("tambo_id") REFERENCES "tambos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animals" ADD CONSTRAINT "animals_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_transfer_events" ADD CONSTRAINT "animal_transfer_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_transfer_events" ADD CONSTRAINT "animal_transfer_events_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_transfer_events" ADD CONSTRAINT "animal_transfer_events_from_tambo_id_fkey" FOREIGN KEY ("from_tambo_id") REFERENCES "tambos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_transfer_events" ADD CONSTRAINT "animal_transfer_events_to_tambo_id_fkey" FOREIGN KEY ("to_tambo_id") REFERENCES "tambos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "animal_transfer_events" ADD CONSTRAINT "animal_transfer_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milking_sessions" ADD CONSTRAINT "milking_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milking_sessions" ADD CONSTRAINT "milking_sessions_tambo_id_fkey" FOREIGN KEY ("tambo_id") REFERENCES "tambos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milking_sessions" ADD CONSTRAINT "milking_sessions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milking_sessions" ADD CONSTRAINT "milking_sessions_corrects_session_id_fkey" FOREIGN KEY ("corrects_session_id") REFERENCES "milking_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_lecheros" ADD CONSTRAINT "control_lecheros_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_lecheros" ADD CONSTRAINT "control_lecheros_tambo_id_fkey" FOREIGN KEY ("tambo_id") REFERENCES "tambos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_lecheros" ADD CONSTRAINT "control_lecheros_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_lecheros" ADD CONSTRAINT "control_lecheros_corrects_control_id_fkey" FOREIGN KEY ("corrects_control_id") REFERENCES "control_lecheros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_lechero_lines" ADD CONSTRAINT "control_lechero_lines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_lechero_lines" ADD CONSTRAINT "control_lechero_lines_tambo_id_fkey" FOREIGN KEY ("tambo_id") REFERENCES "tambos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_lechero_lines" ADD CONSTRAINT "control_lechero_lines_control_lechero_id_fkey" FOREIGN KEY ("control_lechero_id") REFERENCES "control_lecheros"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_lechero_lines" ADD CONSTRAINT "control_lechero_lines_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milk_deliveries" ADD CONSTRAINT "milk_deliveries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milk_deliveries" ADD CONSTRAINT "milk_deliveries_tambo_id_fkey" FOREIGN KEY ("tambo_id") REFERENCES "tambos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milk_deliveries" ADD CONSTRAINT "milk_deliveries_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milk_deliveries" ADD CONSTRAINT "milk_deliveries_cold_equipment_instance_id_fkey" FOREIGN KEY ("cold_equipment_instance_id") REFERENCES "part_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milk_deliveries" ADD CONSTRAINT "milk_deliveries_corrects_delivery_id_fkey" FOREIGN KEY ("corrects_delivery_id") REFERENCES "milk_deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_events" ADD CONSTRAINT "health_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_events" ADD CONSTRAINT "health_events_tambo_id_fkey" FOREIGN KEY ("tambo_id") REFERENCES "tambos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_events" ADD CONSTRAINT "health_events_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_events" ADD CONSTRAINT "health_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repro_events" ADD CONSTRAINT "repro_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repro_events" ADD CONSTRAINT "repro_events_tambo_id_fkey" FOREIGN KEY ("tambo_id") REFERENCES "tambos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repro_events" ADD CONSTRAINT "repro_events_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repro_events" ADD CONSTRAINT "repro_events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_part_type_configs" ADD CONSTRAINT "tenant_part_type_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_part_type_configs" ADD CONSTRAINT "tenant_part_type_configs_part_type_id_fkey" FOREIGN KEY ("part_type_id") REFERENCES "part_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_instances" ADD CONSTRAINT "part_instances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_instances" ADD CONSTRAINT "part_instances_tambo_id_fkey" FOREIGN KEY ("tambo_id") REFERENCES "tambos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_instances" ADD CONSTRAINT "part_instances_part_type_id_fkey" FOREIGN KEY ("part_type_id") REFERENCES "part_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_instances" ADD CONSTRAINT "part_instances_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cold_equipment_details" ADD CONSTRAINT "cold_equipment_details_part_instance_id_fkey" FOREIGN KEY ("part_instance_id") REFERENCES "part_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Partial unique indexes (manual — not expressible in Prisma schema)
-- Source of truth for copy/paste: docs/partial-indexes.sql
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX part_instances_one_active_per_bajada
  ON part_instances (tambo_id, part_type_id, bajada_number)
  WHERE replaced_at IS NULL
    AND bajada_number IS NOT NULL;

CREATE UNIQUE INDEX part_instances_one_active_tambo_level
  ON part_instances (tambo_id, part_type_id)
  WHERE replaced_at IS NULL
    AND bajada_number IS NULL;

CREATE UNIQUE INDEX milking_sessions_one_active_per_shift
  ON milking_sessions (tambo_id, session_date, shift)
  WHERE status = 'ACTIVE';

CREATE UNIQUE INDEX animals_unique_ear_tag_active
  ON animals (tambo_id, ear_tag)
  WHERE status IN ('ACTIVE', 'DRY')
    AND deleted_at IS NULL;
