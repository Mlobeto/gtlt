import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../lib/http-error.js";
import { prisma } from "../lib/prisma.js";
import { calculateAreaUnderCurve, estimateLiters } from "../lib/flow-metrics.js";
import { authenticateDevice } from "../middleware/authenticate-device.js";

export const flowSessionsDeviceRouter = Router();

const openSessionSchema = z.object({
  bajadaNumber: z.number().int().min(1).optional(),
  startedAt: z.string().datetime(),
  electronicId: z.string().trim().min(1).optional(),
});

const pulseBatchSchema = z.object({
  pulses: z
    .array(
      z.object({
        sequence: z.number().int().min(1),
        deltaTSeconds: z.number().positive(),
      }),
    )
    .min(1),
});

const closeSessionSchema = z.object({
  endedAt: z.string().datetime(),
});

flowSessionsDeviceRouter.use(authenticateDevice);

flowSessionsDeviceRouter.post("/flow-sessions", async (req, res) => {
  const parsed = openSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }

  const data = parsed.data;
  const device = req.device!;
  const bajadaNumber = device.bajadaNumber ?? data.bajadaNumber;

  if (!bajadaNumber) {
    throw new HttpError(400, "bajadaNumber is required for this device");
  }

  let animalId: string | null = null;
  let identificationSource: "RFID" | "VOICE" | "UNASSIGNED" = "UNASSIGNED";
  let electronicIdRaw: string | null = null;

  if (data.electronicId) {
    electronicIdRaw = data.electronicId.trim();
    const animal = await prisma.animal.findFirst({
      where: {
        tenantId: device.tenantId,
        tamboId: device.tamboId,
        electronicId: electronicIdRaw,
        deletedAt: null,
      },
      orderBy: { updatedAt: "desc" },
    });

    if (animal) {
      animalId = animal.id;
      identificationSource = "RFID";
    }
  }

  const item = await prisma.flowSession.create({
    data: {
      tenantId: device.tenantId,
      tamboId: device.tamboId,
      bajadaNumber,
      deviceId: device.id,
      startedAt: new Date(data.startedAt),
      animalId,
      identificationSource,
      electronicIdRaw,
      status: "OPEN",
    },
  });

  res.status(201).json({ item });
});

flowSessionsDeviceRouter.post("/flow-sessions/:id/pulses", async (req, res) => {
  const parsed = pulseBatchSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }

  const device = req.device!;
  const session = await prisma.flowSession.findFirst({
    where: {
      id: req.params.id,
      tenantId: device.tenantId,
      tamboId: device.tamboId,
      deviceId: device.id,
      status: "OPEN",
    },
  });

  if (!session) {
    throw new HttpError(409, "Flow session not open for this device");
  }

  const inserts = parsed.data.pulses.map((pulse) => ({
    flowSessionId: session.id,
    sequence: pulse.sequence,
    deltaTSeconds: new Prisma.Decimal(pulse.deltaTSeconds.toString()),
  }));

  await prisma.flowPulse.createMany({
    data: inserts,
  });

  res.json({ ok: true, inserted: inserts.length });
});

flowSessionsDeviceRouter.post("/flow-sessions/:id/close", async (req, res) => {
  const parsed = closeSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }

  const device = req.device!;
  const session = await prisma.flowSession.findFirst({
    where: {
      id: req.params.id,
      tenantId: device.tenantId,
      tamboId: device.tamboId,
      deviceId: device.id,
      status: "OPEN",
    },
  });

  if (!session) {
    throw new HttpError(409, "Flow session not open for this device");
  }

  const pulses = await prisma.flowPulse.findMany({
    where: { flowSessionId: session.id },
    orderBy: { sequence: "asc" },
  });

  const areaUnderCurve = calculateAreaUnderCurve(
    pulses.map((pulse) => ({ deltaTSeconds: Number(pulse.deltaTSeconds) })),
  );
  const pulseCount = pulses.length;
  const estimatedLiters = estimateLiters({ pulseCount, areaUnderCurve });

  const updated = await prisma.flowSession.update({
    where: { id: session.id },
    data: {
      endedAt: new Date(parsed.data.endedAt),
      status: "CLOSED",
      pulseCount,
      areaUnderCurve: new Prisma.Decimal(areaUnderCurve.toFixed(4)),
      estimatedLiters: new Prisma.Decimal(estimatedLiters.toFixed(2)),
    },
  });

  res.json({ item: updated });
});
