import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

/**
 * Tickets de soporte cross-tenant para DESARROLLADORA.
 * El dueño crea y ve los de su tenant en /support-tickets.
 */
export const adminSupportTicketsRouter = Router();

const listQuerySchema = z.object({
  status: z.enum(["OPEN", "IN_REVIEW", "IN_PROGRESS", "CLOSED"]).optional(),
});

const patchSchema = z.object({
  status: z.enum(["OPEN", "IN_REVIEW", "IN_PROGRESS", "CLOSED"]).optional(),
  internalNote: z.string().trim().max(2000).nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
});

adminSupportTicketsRouter.get(
  "/support-tickets",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }

    const items = await prisma.supportTicket.findMany({
      where: {
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        tenant: { select: { id: true, name: true } },
        tambo: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({ items });
  },
);

adminSupportTicketsRouter.patch(
  "/support-tickets/:id",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const existing = await prisma.supportTicket.findFirst({
      where: { id: String(req.params.id) },
    });
    if (!existing) throw new HttpError(404, "Ticket not found");

    const item = await prisma.supportTicket.update({
      where: { id: existing.id },
      data: {
        status: parsed.data.status ?? existing.status,
        priority: parsed.data.priority ?? existing.priority,
        internalNote: parsed.data.internalNote ?? existing.internalNote,
      },
      include: {
        tenant: { select: { id: true, name: true } },
        tambo: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({ item });
  },
);
