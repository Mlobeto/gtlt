import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { hasHardware, parseHardware } from "../lib/tambo-equipment.js";
import { isDeviceConnected } from "../lib/devices.js";
import { tamboLifecycleState } from "../lib/tambo-state.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

/**
 * Panel de plataforma para DESARROLLADORA: creación de tambos a partir
 * de un pedido y activación (inicio de facturación). Cross-tenant a
 * propósito — DESARROLLADORA es un rol de plataforma, no de un tenant puntual.
 */
export const adminTambosRouter = Router();

adminTambosRouter.get(
  "/tambos",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const query = z
      .object({
        state: z.enum(["installing"]).optional(),
      })
      .safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Invalid query", details: query.error.flatten() });
      return;
    }

    const where =
      query.data.state === "installing"
        ? { active: true, activatedAt: null }
        : {};

    const tambos = await prisma.tambo.findMany({
      where,
      include: {
        tenant: { select: { id: true, name: true } },
        devices: {
          where: { retiredAt: null },
          select: { id: true, kind: true, label: true, lastSeenAt: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      items: tambos.map((t) => {
        const connectedDevices = t.devices.filter((d) => isDeviceConnected(d.lastSeenAt));
        return {
          id: t.id,
          tenantId: t.tenantId,
          tenant: t.tenant,
          name: t.name,
          address: t.address,
          bajadaCount: t.bajadaCount,
          active: t.active,
          activatedAt: t.activatedAt,
          state: tamboLifecycleState(t),
          createdAt: t.createdAt,
          activeDevices: t.devices.length,
          connectedDevices: connectedDevices.length,
          devices: t.devices.map((d) => ({
            ...d,
            connected: isDeviceConnected(d.lastSeenAt),
          })),
        };
      }),
    });
  },
);

adminTambosRouter.post(
  "/tambos",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const parsed = z.object({ requestId: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const item = await prisma.$transaction(async (tx) => {
      const request = await tx.tamboRequest.findUnique({
        where: { id: parsed.data.requestId },
      });
      if (!request) throw new HttpError(404, "Pedido no encontrado");
      if (request.tamboId || request.status === "CONVERTED") {
        throw new HttpError(409, "Este pedido ya fue convertido en tambo.");
      }

      const hardware = parseHardware(request.hardware);
      const softwareOnly = !hardware || !hasHardware(hardware);
      const allowed =
        request.status === "ACCEPTED" || (request.status === "SENT" && softwareOnly);
      if (!allowed) {
        throw new HttpError(
          409,
          softwareOnly
            ? "Un pedido solo-software se convierte desde enviado o aceptado."
            : "Solo se puede crear el tambo de un pedido aceptado.",
        );
      }

      const tambo = await tx.tambo.create({
        data: {
          tenantId: request.tenantId,
          name: request.name,
          address: request.address,
          bajadaCount: request.bajadaCount,
          defaultServiceProviderId: request.serviceProviderId,
          active: true,
          activatedAt: null,
        },
      });

      await tx.tamboRequest.update({
        where: { id: request.id },
        data: { status: "CONVERTED", tamboId: tambo.id },
      });

      return tambo;
    });

    res.status(201).json({
      item: {
        ...item,
        state: tamboLifecycleState(item),
      },
    });
  },
);

adminTambosRouter.post(
  "/tambos/:id/activate",
  authenticate,
  requireRoles("DESARROLLADORA"),
  async (req, res) => {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const existing = await prisma.tambo.findUnique({
      where: { id: idParsed.data },
    });
    if (!existing) throw new HttpError(404, "Tambo not found");
    if (!existing.active) {
      throw new HttpError(409, "No se puede activar un tambo archivado.");
    }
    if (existing.activatedAt != null) {
      throw new HttpError(409, "Este tambo ya está activo.");
    }

    const item = await prisma.tambo.update({
      where: { id: existing.id },
      data: { activatedAt: new Date() },
    });

    res.json({
      item: {
        ...item,
        state: tamboLifecycleState(item),
      },
    });
  },
);
