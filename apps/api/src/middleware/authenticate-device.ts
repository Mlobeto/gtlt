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
  });

  if (!device) {
    res.status(401).json({ error: "Invalid device token" });
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
