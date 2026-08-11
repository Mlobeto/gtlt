import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

export const serviceRequestsRouter = Router();

const categorySchema = z.enum([
  "VACUUM_PUMP",
  "COLD_EQUIPMENT",
  "MILKING_GROUP",
  "OTHER",
]);

const statusSchema = z.enum([
  "OPEN",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "RESOLVED",
  "CANCELLED",
]);

const createSchema = z.object({
  tamboId: z.string().uuid(),
  category: categorySchema,
  description: z.string().trim().min(1).max(4000),
  relatedPartInstanceId: z.string().uuid().optional().nullable(),
  assignedTechnicianUserId: z.string().uuid().optional().nullable(),
});

const listSchema = z.object({
  tamboId: z.string().uuid(),
  status: statusSchema.optional(),
});

const patchSchema = z.object({
  status: statusSchema.optional(),
  assignedTechnicianUserId: z.string().uuid().optional().nullable(),
  description: z.string().trim().min(1).max(4000).optional(),
});

/** Crear solicitud — tambero/dueño. Ticket: mal → CANCELLED + nueva. */
serviceRequestsRouter.post(
  "/",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN"),
  async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const data = parsed.data;
    await requireTamboInTenant(auth, data.tamboId);

    if (data.relatedPartInstanceId) {
      const part = await prisma.partInstance.findFirst({
        where: {
          id: data.relatedPartInstanceId,
          tenantId: auth.tenantId,
          tamboId: data.tamboId,
        },
      });
      if (!part) throw new HttpError(404, "Part instance not found in this tambo");
    }

    const item = await prisma.serviceRequest.create({
      data: {
        tenantId: auth.tenantId,
        tamboId: data.tamboId,
        category: data.category,
        description: data.description,
        relatedPartInstanceId: data.relatedPartInstanceId ?? null,
        assignedTechnicianUserId: data.assignedTechnicianUserId ?? null,
        createdById: auth.userId,
        status: "OPEN",
      },
    });

    res.status(201).json({ item });
  },
);

serviceRequestsRouter.get(
  "/",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "TECNICO"),
  async (req, res) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const { tamboId, status } = parsed.data;
    await requireTamboInTenant(auth, tamboId);

    const items = await prisma.serviceRequest.findMany({
      where: {
        tenantId: auth.tenantId,
        tamboId,
        ...(status ? { status } : {}),
      },
      include: {
        relatedPartInstance: {
          include: { partType: true, coldDetail: true },
        },
        assignedTechnician: {
          select: { id: true, name: true, email: true, phone: true },
        },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    res.json({ items });
  },
);

/**
 * Vista técnico: equipo vigente + solicitudes del tambo en un solo response.
 */
serviceRequestsRouter.get(
  "/workspace",
  authenticate,
  requireRoles("TECNICO", "DUENIO", "ADMIN", "TAMBERO"),
  async (req, res) => {
    const parsed = z.object({ tamboId: z.string().uuid() }).safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const { tamboId } = parsed.data;
    await requireTamboInTenant(auth, tamboId);

    const [parts, requests] = await Promise.all([
      prisma.partInstance.findMany({
        where: { tenantId: auth.tenantId, tamboId, replacedAt: null },
        include: { partType: true, coldDetail: true },
        orderBy: [{ bajadaNumber: "asc" }, { installedAt: "desc" }],
      }),
      prisma.serviceRequest.findMany({
        where: {
          tenantId: auth.tenantId,
          tamboId,
          status: { not: "CANCELLED" },
        },
        include: {
          relatedPartInstance: {
            include: { partType: true, coldDetail: true },
          },
          assignedTechnician: {
            select: { id: true, name: true, email: true },
          },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    res.json({
      tamboId,
      partInstances: parts,
      serviceRequests: requests,
    });
  },
);

serviceRequestsRouter.patch(
  "/:id",
  authenticate,
  requireRoles("TECNICO", "TAMBERO", "DUENIO", "ADMIN"),
  async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const existing = await prisma.serviceRequest.findFirst({
      where: { id: String(req.params.id), tenantId: auth.tenantId },
    });
    if (!existing) throw new HttpError(404, "Service request not found");
    await requireTamboInTenant(auth, existing.tamboId);

    const data = parsed.data;
    const farmRoles = new Set(["TAMBERO", "DUENIO", "ADMIN"]);
    const isTecnicoOnly =
      auth.roles.includes("TECNICO") &&
      !auth.roles.some((r) => farmRoles.has(r));

    if (isTecnicoOnly && data.description != null) {
      throw new HttpError(403, "Technician cannot edit description");
    }

    const item = await prisma.serviceRequest.update({
      where: { id: existing.id },
      data: {
        ...(data.status != null
          ? {
              status: data.status,
              resolvedAt: data.status === "RESOLVED" ? new Date() : null,
            }
          : {}),
        ...(data.assignedTechnicianUserId !== undefined
          ? { assignedTechnicianUserId: data.assignedTechnicianUserId }
          : {}),
        ...(data.description != null ? { description: data.description } : {}),
      },
      include: {
        relatedPartInstance: { include: { partType: true, coldDetail: true } },
        assignedTechnician: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.json({ item });
  },
);
