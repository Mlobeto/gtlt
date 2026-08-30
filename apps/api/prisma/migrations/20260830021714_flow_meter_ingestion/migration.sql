-- CreateEnum
CREATE TYPE "DeviceKind" AS ENUM ('FLOW_METER', 'RFID_READER', 'VACUUM_PUMP_SENSOR');

-- CreateEnum
CREATE TYPE "FlowIdentificationSource" AS ENUM ('RFID', 'VOICE', 'UNASSIGNED');

-- CreateEnum
CREATE TYPE "FlowSessionStatus" AS ENUM ('OPEN', 'CLOSED', 'DISCARDED');

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tambo_id" UUID NOT NULL,
    "bajada_number" INTEGER,
    "kind" "DeviceKind" NOT NULL,
    "device_token" TEXT NOT NULL,
    "label" TEXT,
    "last_seen_at" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tambo_id" UUID NOT NULL,
    "bajada_number" INTEGER NOT NULL,
    "device_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "status" "FlowSessionStatus" NOT NULL DEFAULT 'OPEN',
    "animal_id" UUID,
    "identificationSource" "FlowIdentificationSource" NOT NULL DEFAULT 'UNASSIGNED',
    "electronic_id_raw" TEXT,
    "pulse_count" INTEGER,
    "area_under_curve" DECIMAL(12,4),
    "estimated_liters" DECIMAL(12,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flow_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_pulses" (
    "id" UUID NOT NULL,
    "flow_session_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "delta_t_seconds" DECIMAL(8,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flow_pulses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devices_device_token_key" ON "devices"("device_token");

-- CreateIndex
CREATE INDEX "devices_tenant_id_tambo_id_bajada_number_idx" ON "devices"("tenant_id", "tambo_id", "bajada_number");

-- CreateIndex
CREATE INDEX "flow_sessions_tenant_id_tambo_id_bajada_number_status_idx" ON "flow_sessions"("tenant_id", "tambo_id", "bajada_number", "status");

-- CreateIndex
CREATE INDEX "flow_sessions_tenant_id_animal_id_idx" ON "flow_sessions"("tenant_id", "animal_id");

-- CreateIndex
CREATE INDEX "flow_pulses_flow_session_id_sequence_idx" ON "flow_pulses"("flow_session_id", "sequence");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_tambo_id_fkey" FOREIGN KEY ("tambo_id") REFERENCES "tambos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_sessions" ADD CONSTRAINT "flow_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_sessions" ADD CONSTRAINT "flow_sessions_tambo_id_fkey" FOREIGN KEY ("tambo_id") REFERENCES "tambos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_sessions" ADD CONSTRAINT "flow_sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_sessions" ADD CONSTRAINT "flow_sessions_animal_id_fkey" FOREIGN KEY ("animal_id") REFERENCES "animals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flow_pulses" ADD CONSTRAINT "flow_pulses_flow_session_id_fkey" FOREIGN KEY ("flow_session_id") REFERENCES "flow_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
