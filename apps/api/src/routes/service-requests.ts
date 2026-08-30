import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { notifyOwners, createNotification } from "../lib/notifications.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";
import { hasAllTamboAccess } from "../lib/access.js";

export const serviceRequestsRouter = Router();

const categorySchema = z.enum([
  "VACUUM_PUMP",
  "COLD_EQUIPMENT",
  "MILKING_GROUP",
  "OTHER",
]);

const statusSchema = z.enum([
  "PENDING_APPROVAL",
  "OPEN",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "RESOLVED",
  "CANCELLED",
]);

const urgencySchema = z.enum(["NORMAL", "URGENT"]);

const createSchema = z.object({
  tamboId: z.string().uuid(),
  category: categorySchema,
  description: z.string().trim().min(1).max(4000),
  urgency: urgencySchema.optional().default("NORMAL"),
  relatedPartInstanceId: z.string().uuid().optional().nullable(),
  assignedTechnicianUserId: z.string().uuid().optional().nullable(),
});

const listSchema = z.object({
  tamboId: z.string().uuid(),
  status: statusSchema.optional(),
});

const patchSchema = z.object({
  status: z
    .enum(["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "CANCELLED"])
    .optional(),
  assignedTechnicianUserId: z.string().uuid().optional().nullable(),
  description: z.string().trim().min(1).max(4000).optional(),
});

const CATEGORY_ES: Record<string, string> = {
  VACUUM_PUMP: "Bomba de vacío",
  COLD_EQUIPMENT: "Equipo de frío",
  MILKING_GROUP: "Grupo de ordeñe",
  OTHER: "Otro",
};

function urgencyLabel(u: string) {
  return u === "URGENT" ? "URGENTE" : "Normal";
}

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

    const tambo = await prisma.tambo.findFirst({
      where: { id: data.tamboId, tenantId: auth.tenantId },
    });
    if (!tambo) throw new HttpError(404, "Tambo not found");

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

    const ownerCreates = hasAllTamboAccess(auth.roles);
    const needsApproval =
      tambo.serviceRequiresOwnerApproval && !ownerCreates;
    const status = needsApproval ? "PENDING_APPROVAL" : "OPEN";

    const item = await prisma.serviceRequest.create({
      data: {
        tenantId: auth.tenantId,
        tamboId: data.tamboId,
        category: data.category,
        description: data.description,
        urgency: data.urgency,
        relatedPartInstanceId: data.relatedPartInstanceId ?? null,
        assignedTechnicianUserId: data.assignedTechnicianUserId ?? null,
        createdById: auth.userId,
        status,
      },
    });

    const cat = CATEGORY_ES[item.category] ?? item.category;
    const urg = urgencyLabel(item.urgency);
    const payload = {
      serviceRequestId: item.id,
      urgency: item.urgency,
      status: item.status,
    };

    if (needsApproval) {
      await notifyOwners(auth.tenantId, {
        tamboId: item.tamboId,
        type: "SERVICE_PENDING_APPROVAL",
        title: `Service pendiente de aprobación · ${tambo.name}`,
        body: `${urg}: ${cat}. ${item.description.slice(0, 120)}`,
        payload,
        excludeUserId: auth.userId,
      });
    } else {
      await notifyOwners(auth.tenantId, {
        tamboId: item.tamboId,
        type: "SERVICE_REQUESTED",
        title: `Service pedido · ${tambo.name}`,
        body: `${urg}: ${cat}. ${item.description.slice(0, 120)}`,
        payload,
        excludeUserId: auth.userId,
      });
    }

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

    const farmRoles = new Set(["TAMBERO", "DUENIO", "ADMIN"]);
    const isTecnicoOnly =
      auth.roles.includes("TECNICO") &&
      !auth.roles.some((r) => farmRoles.has(r));

    const items = await prisma.serviceRequest.findMany({
      where: {
        tenantId: auth.tenantId,
        tamboId,
        ...(status
          ? { status }
          : isTecnicoOnly
            ? { status: { notIn: ["CANCELLED", "PENDING_APPROVAL"] } }
            : {}),
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
      orderBy: [{ urgency: "desc" }, { createdAt: "desc" }],
      take: 100,
    });

    res.json({ items });
  },
);

/**
 * Vista técnico: equipo vigente + solicitudes visibles (sin PENDING_APPROVAL).
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

    const farmRoles = new Set(["TAMBERO", "DUENIO", "ADMIN"]);
    const isTecnicoOnly =
      auth.roles.includes("TECNICO") &&
      !auth.roles.some((r) => farmRoles.has(r));

    const [parts, requests, tambo] = await Promise.all([
      prisma.partInstance.findMany({
        where: { tenantId: auth.tenantId, tamboId, replacedAt: null },
        include: { partType: true, coldDetail: true },
        orderBy: [{ bajadaNumber: "asc" }, { installedAt: "desc" }],
      }),
      prisma.serviceRequest.findMany({
        where: {
          tenantId: auth.tenantId,
          tamboId,
          status: isTecnicoOnly
            ? { notIn: ["CANCELLED", "PENDING_APPROVAL"] }
            : { not: "CANCELLED" },
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
        orderBy: [{ urgency: "desc" }, { createdAt: "desc" }],
      }),
      prisma.tambo.findFirst({
        where: { id: tamboId, tenantId: auth.tenantId },
        select: {
          id: true,
          name: true,
          serviceRequiresOwnerApproval: true,
        },
      }),
    ]);

    res.json({
      tamboId,
      tambo,
      partInstances: parts,
      serviceRequests: requests,
    });
  },
);

serviceRequestsRouter.post(
  "/:id/approve",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const auth = req.auth!;
    const existing = await prisma.serviceRequest.findFirst({
      where: { id: String(req.params.id), tenantId: auth.tenantId },
      include: { tambo: { select: { name: true } } },
    });
    if (!existing) throw new HttpError(404, "Service request not found");
    await requireTamboInTenant(auth, existing.tamboId);

    if (existing.status !== "PENDING_APPROVAL") {
      throw new HttpError(409, "Service request is not pending approval");
    }

    const item = await prisma.serviceRequest.update({
      where: { id: existing.id },
      data: {
        status: "OPEN",
        approvedById: auth.userId,
        approvedAt: new Date(),
      },
      include: {
        relatedPartInstance: { include: { partType: true, coldDetail: true } },
        createdBy: { select: { id: true, name: true } },
      },
    });

    const cat = CATEGORY_ES[item.category] ?? item.category;
    await createNotification({
      tenantId: auth.tenantId,
      userId: item.createdById,
      tamboId: item.tamboId,
      type: "SERVICE_APPROVED",
      title: `Service aprobado · ${existing.tambo.name}`,
      body: `${urgencyLabel(item.urgency)}: ${cat}. Ya puede verlo el técnico.`,
      payload: { serviceRequestId: item.id, status: item.status },
    });

    res.json({ item });
  },
);

serviceRequestsRouter.post(
  "/:id/reject",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const auth = req.auth!;
    const existing = await prisma.serviceRequest.findFirst({
      where: { id: String(req.params.id), tenantId: auth.tenantId },
      include: { tambo: { select: { name: true } } },
    });
    if (!existing) throw new HttpError(404, "Service request not found");
    await requireTamboInTenant(auth, existing.tamboId);

    if (existing.status !== "PENDING_APPROVAL") {
      throw new HttpError(409, "Service request is not pending approval");
    }

    const item = await prisma.serviceRequest.update({
      where: { id: existing.id },
      data: {
        status: "CANCELLED",
        approvedById: auth.userId,
        approvedAt: new Date(),
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    const cat = CATEGORY_ES[item.category] ?? item.category;
    await createNotification({
      tenantId: auth.tenantId,
      userId: item.createdById,
      tamboId: item.tamboId,
      type: "SERVICE_REJECTED",
      title: `Service rechazado · ${existing.tambo.name}`,
      body: `${urgencyLabel(item.urgency)}: ${cat}. El dueño no autorizó el pedido.`,
      payload: { serviceRequestId: item.id, status: item.status },
    });

    res.json({ item });
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

    if (existing.status === "PENDING_APPROVAL") {
      throw new HttpError(
        409,
        "Pending approval: use approve/reject endpoints",
      );
    }

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
