import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";
import { HttpError } from "../lib/http-error.js";

export const supportTicketsRouter = Router();

const createSchema = z.object({
  tamboId: z.string().uuid().nullable().optional(),
  category: z.enum(["BUG", "QUESTION", "IMPROVEMENT", "OTHER"]),
  subject: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional().default("MEDIUM"),
});

const patchSchema = z.object({
  status: z.enum(["OPEN", "IN_REVIEW", "IN_PROGRESS", "CLOSED"]).optional(),
  internalNote: z.string().trim().max(2000).nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(["OPEN", "IN_REVIEW", "IN_PROGRESS", "CLOSED"]).optional(),
  tamboId: z.string().uuid().optional(),
});

supportTicketsRouter.get(
  "/",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "VETERINARIO", "DESARROLLADORA"),
  async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const isAdminLike = auth.roles.some((role) => ["DUENIO", "ADMIN"].includes(role));

    const items = await prisma.supportTicket.findMany({
      where: {
        tenantId: auth.tenantId,
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
        ...(parsed.data.tamboId ? { tamboId: parsed.data.tamboId } : {}),
        ...(isAdminLike ? {} : { userId: auth.userId }),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        tambo: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({ items });
  },
);

supportTicketsRouter.post(
  "/",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "VETERINARIO", "DESARROLLADORA"),
  async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const data = parsed.data;

    if (data.tamboId) {
      const tambo = await prisma.tambo.findFirst({
        where: { id: data.tamboId, tenantId: auth.tenantId, active: true },
      });
      if (!tambo) {
        throw new HttpError(404, "Tambo not found in this tenant");
      }
    }

    const item = await prisma.supportTicket.create({
      data: {
        tenantId: auth.tenantId,
        tamboId: data.tamboId ?? null,
        userId: auth.userId,
        category: data.category,
        subject: data.subject,
        description: data.description,
        priority: data.priority,
      },
      include: {
        tambo: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    res.status(201).json({ item });
  },
);

supportTicketsRouter.patch(
  "/:id",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const existing = await prisma.supportTicket.findFirst({
      where: { id: String(req.params.id), tenantId: auth.tenantId },
    });

    if (!existing) {
      throw new HttpError(404, "Ticket not found");
    }

    const item = await prisma.supportTicket.update({
      where: { id: existing.id },
      data: {
        status: parsed.data.status ?? existing.status,
        priority: parsed.data.priority ?? existing.priority,
        internalNote: parsed.data.internalNote ?? existing.internalNote,
      },
      include: {
        tambo: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } },
      },
    });

    res.json({ item });
  },
);
