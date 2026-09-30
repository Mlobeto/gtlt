-- CreateEnum
CREATE TYPE "PumpStatus" AS ENUM ('ON', 'OFF');

-- CreateTable
CREATE TABLE "pump_status_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "tambo_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "status" "PumpStatus" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pump_status_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pump_status_events_tenant_id_tambo_id_occurred_at_idx" ON "pump_status_events"("tenant_id", "tambo_id", "occurred_at");

-- CreateIndex
CREATE INDEX "pump_status_events_device_id_occurred_at_idx" ON "pump_status_events"("device_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "pump_status_events" ADD CONSTRAINT "pump_status_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pump_status_events" ADD CONSTRAINT "pump_status_events_tambo_id_fkey" FOREIGN KEY ("tambo_id") REFERENCES "tambos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pump_status_events" ADD CONSTRAINT "pump_status_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
