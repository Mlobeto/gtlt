import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import {
  assertSubscriptionActive,
  getBillingSummary,
} from "../lib/tambo-billing.js";
import { tamboLifecycleState } from "../lib/tambo-state.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

export const tambosRouter = Router();

function locationFields(t: {
  latitude: { toNumber(): number } | number | null;
  longitude: { toNumber(): number } | number | null;
  address: string | null;
}) {
  const lat = t.latitude == null ? null : typeof t.latitude === "number" ? t.latitude : t.latitude.toNumber();
  const lng =
    t.longitude == null ? null : typeof t.longitude === "number" ? t.longitude : t.longitude.toNumber();
  return { latitude: lat, longitude: lng, address: t.address };
}

/**
 * Tambos visibles para el JWT actual (scope tenant + MembershipTambo).
 * Ejemplo de query siempre filtrada por tenantId del token.
 */
const DEVICE_KIND_LABEL: Record<string, string> = {
  VACUUM_PUMP_SENSOR: "Sensor de bomba de vacío",
  FLOW_METER: "Caudalímetro",
  RFID_READER: "Lector de caravanas",
};

const DEVICE_REMOVAL_DESCRIPTION =
  "Retirar los dispositivos instalados para dar de baja el tambo";

tambosRouter.get("/", authenticate, async (req, res) => {
  const auth = req.auth!;
  const includeArchived =
    req.query.includeArchived === "1" || req.query.includeArchived === "true";

  const tambos = await prisma.tambo.findMany({
    where: {
      tenantId: auth.tenantId,
      ...(includeArchived ? {} : { active: true }),
      ...(auth.tamboIds === null ? {} : { id: { in: auth.tamboIds } }),
    },
    select: {
      id: true,
      name: true,
      bajadaCount: true,
      active: true,
      activatedAt: true,
      serviceRequiresOwnerApproval: true,
      latitude: true,
      longitude: true,
      address: true,
    },
    orderBy: { name: "asc" },
  });

  res.json({
    items: tambos.map((t) => ({
      ...t,
      ...locationFields(t),
      state: tamboLifecycleState(t),
    })),
  });
});

tambosRouter.get(
  "/billing-summary",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const billing = await getBillingSummary(req.auth!.tenantId);
    res.json(billing);
  },
);

const historyQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

type PumpEventRow = {
  deviceId: string;
  status: "ON" | "OFF";
  occurredAt: Date;
};

type PumpInterval = {
  deviceId: string;
  start: string;
  end: string | null;
  durationMinutes: number | null;
  ongoing: boolean;
};

/** Empareja ON→OFF por dispositivo. ON extra sin OFF queda ongoing (end/duration null). */
function intervalsFromEvents(events: PumpEventRow[]): PumpInterval[] {
  const byDevice = new Map<string, PumpEventRow[]>();
  for (const event of events) {
    const list = byDevice.get(event.deviceId) ?? [];
    list.push(event);
    byDevice.set(event.deviceId, list);
  }

  const intervals: PumpInterval[] = [];
  for (const [deviceId, list] of byDevice) {
    let openStart: Date | null = null;
    for (const event of list) {
      if (event.status === "ON") {
        if (openStart == null) openStart = event.occurredAt;
        continue;
      }
      if (openStart == null) continue;
      const durationMinutes = Math.round(
        (event.occurredAt.getTime() - openStart.getTime()) / 60_000,
      );
      intervals.push({
        deviceId,
        start: openStart.toISOString(),
        end: event.occurredAt.toISOString(),
        durationMinutes,
        ongoing: false,
      });
      openStart = null;
    }
    if (openStart != null) {
      intervals.push({
        deviceId,
        start: openStart.toISOString(),
        end: null,
        durationMinutes: null,
        ongoing: true,
      });
    }
  }

  intervals.sort((a, b) => a.start.localeCompare(b.start));
  return intervals;
}

tambosRouter.get("/:tamboId/pump-status/history", authenticate, async (req, res) => {
  const tamboId = String(req.params.tamboId);
  const tamboIdParsed = z.string().uuid().safeParse(tamboId);
  if (!tamboIdParsed.success) {
    res.status(400).json({ error: "Invalid tamboId" });
    return;
  }

  const query = historyQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: "Invalid query", details: query.error.flatten() });
    return;
  }

  const now = new Date();
  const from = query.data.from
    ? new Date(query.data.from)
    : new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const to = query.data.to ? new Date(query.data.to) : now;

  if (from > to) {
    res.status(400).json({ error: "from must be before to" });
    return;
  }

  const auth = req.auth!;
  await requireTamboInTenant(auth, tamboId);

  const events = await prisma.pumpStatusEvent.findMany({
    where: {
      tenantId: auth.tenantId,
      tamboId,
      occurredAt: { gte: from, lte: to },
    },
    orderBy: { occurredAt: "asc" },
    select: { deviceId: true, status: true, occurredAt: true },
  });

  res.json({ intervals: intervalsFromEvents(events) });
});

tambosRouter.get("/:tamboId/pump-status", authenticate, async (req, res) => {
  const tamboId = String(req.params.tamboId);
  const parsed = z.string().uuid().safeParse(tamboId);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid tamboId" });
    return;
  }

  const auth = req.auth!;
  await requireTamboInTenant(auth, tamboId);

  const item = await prisma.pumpStatusEvent.findFirst({
    where: { tenantId: auth.tenantId, tamboId },
    orderBy: { occurredAt: "desc" },
  });

  if (!item) {
    res.json({ status: null });
    return;
  }

  res.json({ status: item.status, item });
});

tambosRouter.get(
  "/:tamboId/photos/pending-review",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "VETERINARIO"),
  async (req, res) => {
    const tamboId = String(req.params.tamboId);
    const parsed = z.string().uuid().safeParse(tamboId);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid tamboId" });
      return;
    }

    const auth = req.auth!;
    await requireTamboInTenant(auth, tamboId);

    const items = await prisma.animalPhoto.findMany({
      where: {
        tenantId: auth.tenantId,
        tamboId,
        type: "CONSULT",
        reviewedAt: null,
      },
      include: {
        animal: { select: { id: true, earTag: true } },
      },
      orderBy: { takenAt: "desc" },
      take: 100,
    });

    res.json({ items });
  },
);

tambosRouter.get("/:tamboId/service-provider", authenticate, async (req, res) => {
  const tamboId = String(req.params.tamboId);
  const parsed = z.string().uuid().safeParse(tamboId);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid tamboId" });
    return;
  }

  const auth = req.auth!;
  await requireTamboInTenant(auth, tamboId);

  const [tambo, catalog] = await Promise.all([
    prisma.tambo.findFirst({
      where: { id: tamboId, tenantId: auth.tenantId },
      select: { defaultServiceProviderId: true },
    }),
    prisma.serviceProvider.findMany({
      where: { active: true },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    }),
  ]);

  res.json({
    catalog,
    selectedId: tambo?.defaultServiceProviderId ?? null,
  });
});

tambosRouter.patch(
  "/:tamboId/service-provider",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const tamboId = String(req.params.tamboId);
    const tamboParsed = z.string().uuid().safeParse(tamboId);
    const body = z.object({ serviceProviderId: z.string().uuid() }).safeParse(req.body);
    if (!tamboParsed.success || !body.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const auth = req.auth!;
    await requireTamboInTenant(auth, tamboId);

    const provider = await prisma.serviceProvider.findFirst({
      where: { id: body.data.serviceProviderId, active: true },
    });
    if (!provider) throw new HttpError(404, "Service provider not found");

    const item = await prisma.tambo.update({
      where: { id: tamboId },
      data: { defaultServiceProviderId: provider.id },
      select: {
        id: true,
        name: true,
        defaultServiceProviderId: true,
      },
    });

    res.json({ item });
  },
);

tambosRouter.patch(
  "/:tamboId/location",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN"),
  async (req, res) => {
    const tamboId = String(req.params.tamboId);
    const idParsed = z.string().uuid().safeParse(tamboId);
    const body = z
      .object({
        latitude: z.number().gte(-90).lte(90),
        longitude: z.number().gte(-180).lte(180),
        address: z.string().trim().max(500).optional(),
      })
      .safeParse(req.body);
    if (!idParsed.success || !body.success) {
      res.status(400).json({
        error: "Invalid body",
        details: body.success ? undefined : body.error.flatten(),
      });
      return;
    }

    const auth = req.auth!;
    await requireTamboInTenant(auth, tamboId);

    const existing = await prisma.tambo.findFirst({
      where: { id: tamboId, tenantId: auth.tenantId, active: true },
    });
    if (!existing) throw new HttpError(404, "Tambo not found");

    const item = await prisma.tambo.update({
      where: { id: existing.id },
      data: {
        latitude: body.data.latitude,
        longitude: body.data.longitude,
        ...(body.data.address !== undefined ? { address: body.data.address } : {}),
      },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        address: true,
      },
    });

    res.json({ item: { ...item, ...locationFields(item) } });
  },
);

tambosRouter.patch(
  "/:tamboId/active",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const tamboId = String(req.params.tamboId);
    const idParsed = z.string().uuid().safeParse(tamboId);
    const body = z.object({ active: z.boolean() }).safeParse(req.body);
    if (!idParsed.success || !body.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const auth = req.auth!;
    const existing = await requireTamboInTenant(auth, tamboId, { includeInactive: true });

    if (body.data.active === existing.active) {
      res.json({
        item: {
          id: existing.id,
          name: existing.name,
          bajadaCount: existing.bajadaCount,
          active: existing.active,
        },
        billing: await getBillingSummary(auth.tenantId),
      });
      return;
    }

    if (body.data.active) {
      await assertSubscriptionActive(auth.tenantId);
    } else {
      const activeCount = await prisma.tambo.count({
        where: { tenantId: auth.tenantId, active: true },
      });
      if (activeCount <= 1) {
        throw new HttpError(409, "No se puede archivar el último tambo activo.");
      }

      const devices = await prisma.device.findMany({
        where: { tamboId: existing.id, retiredAt: null },
        select: { kind: true },
      });
      if (devices.length > 0) {
        throw new HttpError(
          409,
          `Este tambo tiene ${devices.length} dispositivo${devices.length === 1 ? "" : "s"} instalado${devices.length === 1 ? "" : "s"}. Para darlo de baja hay que retirarlos.`,
          "TAMBO_HAS_DEVICES",
          {
            count: devices.length,
            kinds: devices.map((d) => d.kind),
          },
        );
      }
    }

    const item = await prisma.tambo.update({
      where: { id: existing.id },
      data: { active: body.data.active },
      select: {
        id: true,
        name: true,
        bajadaCount: true,
        active: true,
      },
    });

    res.json({
      item,
      billing: await getBillingSummary(auth.tenantId),
    });
  },
);

tambosRouter.post(
  "/:tamboId/request-device-removal",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const tamboId = String(req.params.tamboId);
    const parsed = z.string().uuid().safeParse(tamboId);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid tamboId" });
      return;
    }

    const auth = req.auth!;
    const tambo = await requireTamboInTenant(auth, tamboId, { includeInactive: true });

    const existing = await prisma.serviceRequest.findFirst({
      where: {
        tenantId: auth.tenantId,
        tamboId: tambo.id,
        description: DEVICE_REMOVAL_DESCRIPTION,
        status: { notIn: ["RESOLVED", "CANCELLED"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      res.json({ item: existing });
      return;
    }

    const item = await prisma.serviceRequest.create({
      data: {
        tenantId: auth.tenantId,
        tamboId: tambo.id,
        category: "OTHER",
        description: DEVICE_REMOVAL_DESCRIPTION,
        urgency: "NORMAL",
        serviceProviderId: tambo.defaultServiceProviderId,
        createdById: auth.userId,
        status: "OPEN",
      },
    });

    res.status(201).json({ item });
  },
);

tambosRouter.patch(
  "/:id",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const parsed = z
      .object({
        serviceRequiresOwnerApproval: z.boolean().optional(),
        name: z.string().trim().min(2).max(80).optional(),
        bajadaCount: z.number().int().min(1).max(60).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const id = String(req.params.id);
    const existing = await requireTamboInTenant(auth, id, { includeInactive: true });

    if (parsed.data.bajadaCount != null && parsed.data.bajadaCount < existing.bajadaCount) {
      const [parts, devices] = await Promise.all([
        prisma.partInstance.findMany({
          where: {
            tamboId: existing.id,
            replacedAt: null,
            bajadaNumber: { gt: parsed.data.bajadaCount },
          },
          include: { partType: { select: { name: true } } },
        }),
        prisma.device.findMany({
          where: {
            tamboId: existing.id,
            retiredAt: null,
            bajadaNumber: { gt: parsed.data.bajadaCount },
          },
          select: { kind: true, bajadaNumber: true },
        }),
      ]);

      const blockers = [
        ...parts.map((p) => ({
          kind: "part" as const,
          type: p.partType.name,
          bajadaNumber: p.bajadaNumber,
        })),
        ...devices.map((d) => ({
          kind: "device" as const,
          type: DEVICE_KIND_LABEL[d.kind] ?? d.kind,
          bajadaNumber: d.bajadaNumber,
        })),
      ];

      if (blockers.length > 0) {
        const detail = blockers
          .map((b) => `${b.type} (bajada ${b.bajadaNumber})`)
          .join(", ");
        throw new HttpError(
          409,
          `No se pueden bajar las bajadas: hay piezas o dispositivos en uso. ${detail}`,
          "BAJADAS_EN_USO",
          { blockers },
        );
      }
    }

    const item = await prisma.tambo.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.serviceRequiresOwnerApproval !== undefined
          ? {
              serviceRequiresOwnerApproval:
                parsed.data.serviceRequiresOwnerApproval,
            }
          : {}),
        ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
        ...(parsed.data.bajadaCount != null
          ? { bajadaCount: parsed.data.bajadaCount }
          : {}),
      },
      select: {
        id: true,
        name: true,
        bajadaCount: true,
        active: true,
        serviceRequiresOwnerApproval: true,
      },
    });

    res.json({ item });
  },
);
