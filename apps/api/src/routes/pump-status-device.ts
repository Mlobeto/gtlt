import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticateDevice } from "../middleware/authenticate-device.js";

export const pumpStatusDeviceRouter = Router();

const pumpStatusSchema = z.object({
  status: z.enum(["ON", "OFF"]),
  occurredAt: z.string().datetime(),
});

pumpStatusDeviceRouter.use(authenticateDevice);

pumpStatusDeviceRouter.post("/pump-status", async (req, res) => {
  const parsed = pumpStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
    return;
  }

  const device = req.device!;
  const item = await prisma.pumpStatusEvent.create({
    data: {
      tenantId: device.tenantId,
      tamboId: device.tamboId,
      deviceId: device.id,
      status: parsed.data.status,
      occurredAt: new Date(parsed.data.occurredAt),
    },
  });

  res.status(201).json({ item });
});
