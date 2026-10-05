import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { workReportListSummary } from "../lib/work-report-ops.js";
import { authenticate } from "../middleware/authenticate.js";

export const myRouter = Router();

const OPEN_STATUSES = ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS"] as const;

/**
 * Pedidos abiertos de todos los tenants donde el usuario es TECNICO.
 * Ignora auth.tenantId a propósito (bandeja cross-tenant).
 */
myRouter.get("/service-requests", authenticate, async (req, res) => {
  const userId = req.auth!.userId;

  const memberships = await prisma.membership.findMany({
    where: {
      userId,
      status: "ACTIVE",
      roles: { has: "TECNICO" },
    },
    include: {
      tenant: { select: { id: true, name: true } },
      tambos: { select: { tamboId: true } },
    },
  });

  if (memberships.length === 0) {
    throw new HttpError(403, "Este endpoint es solo para técnicos");
  }

  const orFilters = memberships.flatMap((m) => {
    const tamboIds = m.tambos.map((t) => t.tamboId);
    if (tamboIds.length === 0) return [];
    return [
      {
        tenantId: m.tenantId,
        tamboId: { in: tamboIds },
        status: { in: [...OPEN_STATUSES] },
        ...(m.serviceProviderId ? { serviceProviderId: m.serviceProviderId } : {}),
      },
    ];
  });

  if (orFilters.length === 0) {
    res.json({ items: [] });
    return;
  }

  const rows = await prisma.serviceRequest.findMany({
    where: { OR: orFilters },
    select: {
      id: true,
      category: true,
      status: true,
      urgency: true,
      description: true,
      createdAt: true,
      tenant: { select: { id: true, name: true } },
      tambo: {
        select: {
          id: true,
          name: true,
          latitude: true,
          longitude: true,
          address: true,
          powerSupply: true,
        },
      },
      workReports: {
        select: {
          id: true,
          status: true,
          _count: { select: { installedParts: true } },
        },
        orderBy: { updatedAt: "desc" },
      },
    },
    orderBy: [{ urgency: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  res.json({
    items: rows.map((row) => ({
      id: row.id,
      category: row.category,
      status: row.status,
      urgency: row.urgency,
      description: row.description,
      createdAt: row.createdAt.toISOString(),
      tenant: row.tenant,
      workReport: workReportListSummary(row.workReports),
      tambo: {
        id: row.tambo.id,
        name: row.tambo.name,
        latitude: row.tambo.latitude == null ? null : Number(row.tambo.latitude),
        longitude: row.tambo.longitude == null ? null : Number(row.tambo.longitude),
        address: row.tambo.address,
        powerSupply: row.tambo.powerSupply,
      },
    })),
  });
});
