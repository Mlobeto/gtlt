import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export async function authenticateDevice(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers["x-device-token"];
  const token = typeof header === "string" ? header.trim() : "";

  if (!token) {
    res.status(401).json({ error: "Missing X-Device-Token header" });
    return;
  }

  const device = await prisma.device.findUnique({
    where: { deviceToken: token },
    include: { tambo: { select: { active: true } } },
  });

  if (!device) {
    res.status(401).json({ error: "Invalid device token" });
    return;
  }

  if (device.retiredAt) {
    res.status(403).json({
      error: "Este dispositivo fue retirado.",
      code: "DEVICE_RETIRED",
    });
    return;
  }

  if (!device.tambo.active) {
    res.status(403).json({
      error: "El tambo de este dispositivo está archivado.",
      code: "TAMBO_ARCHIVED",
    });
    return;
  }

  void prisma.device
    .update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    })
    .catch(() => undefined);

  req.device = {
    id: device.id,
    tenantId: device.tenantId,
    tamboId: device.tamboId,
    bajadaNumber: device.bajadaNumber ?? null,
    kind: device.kind,
  };

  next();
}
