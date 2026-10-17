import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { notifyOwners, createNotification } from "../lib/notifications.js";
import { withPartLife } from "../lib/part-life-attach.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import { workReportListSummary, workReportOnServiceSelect } from "../lib/work-report-ops.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";
import { hasAllTamboAccess } from "../lib/access.js";
import { changeDefaultServiceProvider } from "../lib/service-provider-periods.js";
import {
  assertVisibleActiveProvider,
  requestProviderSelect,
  serializeRequestProvider,
} from "../lib/service-providers.js";
import { whatsappChatUrl } from "../lib/phone.js";
import type { AuthContext } from "../types/express.js";

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
  serviceProviderId: z.string().uuid().optional(),
  makeDefault: z.boolean().optional(),
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
  performedBy: z.string().trim().max(200).optional().nullable(),
  resolutionNotes: z.string().trim().max(1000).optional().nullable(),
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

function isTecnicoOnly(auth: AuthContext) {
  const farmRoles = new Set(["TAMBERO", "DUENIO", "ADMIN"]);
  return auth.roles.includes("TECNICO") && !auth.roles.some((r) => farmRoles.has(r));
}

/** Técnico de un proveedor: solo ve pedidos dirigidos a ese proveedor. Independiente: todo el tambo. */
function technicianProviderWhere(auth: AuthContext) {
  if (!isTecnicoOnly(auth) || !auth.serviceProviderId) return {};
  return { serviceProviderId: auth.serviceProviderId };
}

const requestInclude = {
  relatedPartInstance: {
    include: { partType: true, coldDetail: true },
  },
  assignedTechnician: {
    select: { id: true, name: true, email: true, phone: true },
  },
  createdBy: { select: { id: true, name: true } },
  serviceProvider: { select: requestProviderSelect },
  workReports: workReportOnServiceSelect,
} as const;

function shapeRequest<
  T extends {
    serviceProvider?: Parameters<typeof serializeRequestProvider>[0];
    workReports?: Parameters<typeof workReportListSummary>[0];
  },
>(row: T) {
  const { workReports, serviceProvider, ...item } = row;
  return {
    ...item,
    serviceProvider: serializeRequestProvider(serviceProvider ?? null),
    ...(workReports !== undefined
      ? { workReport: workReportListSummary(workReports) }
      : {}),
  };
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
    if (
      !ownerCreates &&
      (data.serviceProviderId != null || data.makeDefault != null)
    ) {
      throw new HttpError(
        403,
        "Solo el dueño o administrador puede pedir a otro proveedor.",
      );
    }
    if (data.makeDefault && !data.serviceProviderId) {
      throw new HttpError(
        400,
        "Para dejarla como predeterminada hay que elegir un proveedor.",
      );
    }

    const needsApproval =
      tambo.serviceRequiresOwnerApproval && !ownerCreates;
    const status = needsApproval ? "PENDING_APPROVAL" : "OPEN";

    const created = await prisma.$transaction(async (tx) => {
      let providerId = tambo.defaultServiceProviderId;
      if (data.serviceProviderId) {
        const provider = await assertVisibleActiveProvider(
          tx,
          auth.tenantId,
          data.serviceProviderId,
        );
        providerId = provider.id;
        if (data.makeDefault) {
          await changeDefaultServiceProvider(tx, {
            tamboId: data.tamboId,
            serviceProviderId: provider.id,
            startedById: auth.userId,
          });
        }
      }

      return tx.serviceRequest.create({
        data: {
          tenantId: auth.tenantId,
          tamboId: data.tamboId,
          category: data.category,
          description: data.description,
          urgency: data.urgency,
          relatedPartInstanceId: data.relatedPartInstanceId ?? null,
          assignedTechnicianUserId: data.assignedTechnicianUserId ?? null,
          serviceProviderId: providerId,
          createdById: auth.userId,
          status,
        },
        include: { serviceProvider: { select: requestProviderSelect } },
      });
    });
    const item = shapeRequest(created);

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

    const items = await prisma.serviceRequest.findMany({
      where: {
        tenantId: auth.tenantId,
        tamboId,
        ...technicianProviderWhere(auth),
        ...(status
          ? { status }
          : isTecnicoOnly(auth)
            ? { status: { notIn: ["CANCELLED", "PENDING_APPROVAL"] } }
            : {}),
      },
      include: requestInclude,
      orderBy: [{ urgency: "desc" }, { createdAt: "desc" }],
      take: 100,
    });

    res.json({
      items: items.map((row) => shapeRequest(row)),
    });
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

    const [parts, requests, tambo] = await Promise.all([
      prisma.partInstance.findMany({
        where: { tenantId: auth.tenantId, tamboId, replacedAt: null },
        include: {
          partType: {
            include: { fields: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
          },
          coldDetail: true,
        },
        orderBy: [{ bajadaNumber: "asc" }, { installedAt: "desc" }],
      }),
      prisma.serviceRequest.findMany({
        where: {
          tenantId: auth.tenantId,
          tamboId,
          ...technicianProviderWhere(auth),
          status: isTecnicoOnly(auth)
            ? { notIn: ["CANCELLED", "PENDING_APPROVAL"] }
            : { not: "CANCELLED" },
        },
        include: requestInclude,
        orderBy: [{ urgency: "desc" }, { createdAt: "desc" }],
      }),
      prisma.tambo.findFirst({
        where: { id: tamboId, tenantId: auth.tenantId },
        select: {
          id: true,
          name: true,
          serviceRequiresOwnerApproval: true,
          latitude: true,
          longitude: true,
          address: true,
          powerSupply: true,
        },
      }),
    ]);

    res.json({
      tamboId,
      tambo: tambo
        ? {
            ...tambo,
            latitude: tambo.latitude == null ? null : Number(tambo.latitude),
            longitude: tambo.longitude == null ? null : Number(tambo.longitude),
          }
        : null,
      partInstances: await withPartLife(auth.tenantId, parts),
      serviceRequests: requests.map((row) => shapeRequest(row)),
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

serviceRequestsRouter.get(
  "/:id/whatsapp-link",
  authenticate,
  requireRoles("DUENIO", "ADMIN", "TAMBERO"),
  async (req, res) => {
    const auth = req.auth!;
    const existing = await prisma.serviceRequest.findFirst({
      where: { id: String(req.params.id), tenantId: auth.tenantId },
      include: {
        tambo: {
          select: { name: true, latitude: true, longitude: true },
        },
        serviceProvider: { select: { contactPhone: true, name: true } },
      },
    });
    if (!existing) throw new HttpError(404, "Service request not found");
    await requireTamboInTenant(auth, existing.tamboId);

    const phone = existing.serviceProvider?.contactPhone;
    if (!phone) {
      throw new HttpError(404, "Esta empresa no tiene teléfono.");
    }

    const cat = CATEGORY_ES[existing.category] ?? existing.category;
    const urg = urgencyLabel(existing.urgency);
    const lat =
      existing.tambo.latitude == null ? null : Number(existing.tambo.latitude);
    const lng =
      existing.tambo.longitude == null ? null : Number(existing.tambo.longitude);
    const location =
      lat != null && lng != null
        ? `\nUbicación: https://maps.google.com/?q=${lat},${lng}`
        : "";
    const text = `Pedido de service en CAL · ${existing.tambo.name}\n${cat} · ${urg}\n${existing.description}${location}`;

    res.json({ url: whatsappChatUrl(phone, text) });
  },
);

serviceRequestsRouter.post(
  "/:id/mark-notified",
  authenticate,
  requireRoles("DUENIO", "ADMIN", "TAMBERO"),
  async (req, res) => {
    const auth = req.auth!;
    const existing = await prisma.serviceRequest.findFirst({
      where: { id: String(req.params.id), tenantId: auth.tenantId },
    });
    if (!existing) throw new HttpError(404, "Service request not found");
    await requireTamboInTenant(auth, existing.tamboId);

    const item = await prisma.serviceRequest.update({
      where: { id: existing.id },
      data: {
        providerNotifiedAt: new Date(),
        providerNotifyChannel: "WHATSAPP",
      },
      include: requestInclude,
    });

    res.json({ item: shapeRequest(item) });
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
      where: {
        id: String(req.params.id),
        tenantId: auth.tenantId,
        ...technicianProviderWhere(auth),
      },
      include: { serviceProvider: { select: requestProviderSelect } },
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
    if (isTecnicoOnly(auth) && data.description != null) {
      throw new HttpError(403, "Technician cannot edit description");
    }

    const ownerAdmin = hasAllTamboAccess(auth.roles);
    const hasPanel = existing.serviceProvider?.hasPanel ?? false;

    if (data.performedBy !== undefined || data.resolutionNotes !== undefined) {
      if (!ownerAdmin) {
        throw new HttpError(
          403,
          "Solo el dueño o administrador puede anotar quién hizo el servicio.",
        );
      }
    }

    if (data.status != null) {
      if (!hasPanel) {
        if (!ownerAdmin) {
          throw new HttpError(
            403,
            "Solo el dueño o administrador puede actualizar el estado de este pedido.",
          );
        }
      } else if (ownerAdmin) {
        if (data.status !== "CANCELLED" || existing.createdById !== auth.userId) {
          throw new HttpError(
            403,
            "Esta empresa gestiona el pedido en su panel. Solo podés cancelar los pedidos que creaste.",
          );
        }
      }
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
        ...(data.performedBy !== undefined
          ? { performedBy: data.performedBy?.trim() || null }
          : {}),
        ...(data.resolutionNotes !== undefined
          ? { resolutionNotes: data.resolutionNotes?.trim() || null }
          : {}),
      },
      include: requestInclude,
    });

    res.json({ item: shapeRequest(item) });
  },
);
