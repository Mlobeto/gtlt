import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";

export const notificationsRouter = Router();

notificationsRouter.get("/", authenticate, async (req, res) => {
  const auth = req.auth!;
  const unreadOnly = req.query.unreadOnly === "true" || req.query.unreadOnly === "1";

  const items = await prisma.notification.findMany({
    where: {
      tenantId: auth.tenantId,
      userId: auth.userId,
      ...(unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const unreadCount = await prisma.notification.count({
    where: {
      tenantId: auth.tenantId,
      userId: auth.userId,
      readAt: null,
    },
  });

  res.json({ items, unreadCount });
});

notificationsRouter.post("/:id/read", authenticate, async (req, res) => {
  const auth = req.auth!;
  const id = String(req.params.id);

  const existing = await prisma.notification.findFirst({
    where: { id, tenantId: auth.tenantId, userId: auth.userId },
  });
  if (!existing) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  const item = await prisma.notification.update({
    where: { id: existing.id },
    data: { readAt: existing.readAt ?? new Date() },
  });

  res.json({ item });
});

notificationsRouter.post("/read-all", authenticate, async (req, res) => {
  const auth = req.auth!;
  const result = await prisma.notification.updateMany({
    where: {
      tenantId: auth.tenantId,
      userId: auth.userId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });
  res.json({ updated: result.count });
});
