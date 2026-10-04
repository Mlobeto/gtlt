import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import {
  createInstalledDevice,
  listActiveDevices,
  retireDevice,
  rotateDeviceToken,
} from "../lib/devices.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

/**
 * Panel de plataforma para DESARROLLADORA: alta, lista, rotación y retiro
 * de dispositivos en cualquier tambo. Cross-tenant a propósito —
 * DESARROLLADORA es un rol de plataforma, no de un tenant puntual.
 */
export const adminDevicesRouter = Router();

const tamboQuerySchema = z.object({
  tamboId: z.string().uuid(),
});

const createSchema = z.object({
  tamboId: z.string().uuid(),
  kind: z.enum(["VACUUM_PUMP_SENSOR", "FLOW_METER", "RFID_READER"]),
  bajadaNumber: z.number().int().min(1).optional().nullable(),
  label: z.string().trim().min(1).max(120).optional().nullable(),
});

adminDevicesRouter.get(
  "/devices",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const parsed = tamboQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }

    const tambo = await prisma.tambo.findUnique({
      where: { id: parsed.data.tamboId },
      select: { id: true },
    });
    if (!tambo) throw new HttpError(404, "Tambo not found");

    const listed = await listActiveDevices(tambo.id);
    res.json({
      items: listed.items,
      tambo: listed.tambo,
      canManage: true,
    });
  },
);

adminDevicesRouter.post(
  "/devices",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const tambo = await prisma.tambo.findUnique({ where: { id: parsed.data.tamboId } });
    if (!tambo) throw new HttpError(404, "Tambo not found");

    const result = await createInstalledDevice({
      tambo,
      kind: parsed.data.kind,
      bajadaNumber: parsed.data.bajadaNumber,
      label: parsed.data.label,
      createdById: req.auth!.userId,
    });

    res.status(201).json(result);
  },
);

adminDevicesRouter.post(
  "/devices/:id/rotate-token",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const result = await rotateDeviceToken(String(req.params.id));
    res.json(result);
  },
);

adminDevicesRouter.post(
  "/devices/:id/retire",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const result = await retireDevice(String(req.params.id));
    res.json(result);
  },
);

const installersQuerySchema = z.object({
  tenantId: z.string().uuid(),
});

const installerPatchSchema = z.object({
  enabled: z.boolean(),
});

adminDevicesRouter.get(
  "/installers",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const parsed = installersQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: parsed.data.tenantId },
      select: { id: true, name: true },
    });
    if (!tenant) throw new HttpError(404, "Tenant not found");

    const memberships = await prisma.membership.findMany({
      where: { tenantId: tenant.id, roles: { has: "TECNICO" } },
      include: {
        user: { select: { id: true, name: true, email: true } },
        serviceProvider: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    res.json({
      items: memberships.map((m) => ({
        id: m.id,
        canInstallDevices: m.canInstallDevices,
        tenant,
        user: m.user,
        serviceProvider: m.serviceProvider,
      })),
    });
  },
);

adminDevicesRouter.patch(
  "/memberships/:id/installer",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const parsed = installerPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const membership = await prisma.membership.findUnique({
      where: { id: String(req.params.id) },
      include: {
        user: { select: { id: true, name: true, email: true } },
        tenant: { select: { id: true, name: true } },
        serviceProvider: { select: { id: true, name: true } },
      },
    });
    if (!membership) throw new HttpError(404, "Membership not found");

    if (parsed.data.enabled) {
      if (!membership.roles.includes("TECNICO") || !membership.serviceProviderId) {
        throw new HttpError(
          409,
          "Solo se autoriza a un técnico de un proveedor formal. Un independiente no se puede habilitar.",
        );
      }
    }

    const updated = await prisma.membership.update({
      where: { id: membership.id },
      data: { canInstallDevices: parsed.data.enabled },
      include: {
        user: { select: { id: true, name: true, email: true } },
        tenant: { select: { id: true, name: true } },
        serviceProvider: { select: { id: true, name: true } },
      },
    });

    res.json({
      item: {
        id: updated.id,
        canInstallDevices: updated.canInstallDevices,
        tenant: updated.tenant,
        user: updated.user,
        serviceProvider: updated.serviceProvider,
      },
    });
  },
);
