import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { calculateEquipmentList, hasHardware } from "../lib/tambo-equipment.js";
import {
  serializeTamboRequest,
  tamboRequestInclude,
} from "../lib/tambo-request-dto.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

export const tamboRequestsRouter = Router();

const hardwareSchema = z.object({
  pumpSensor: z.boolean(),
  flowMeters: z.boolean(),
  rfidReaders: z.boolean(),
});

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
  address: z.string().trim().max(500).optional().nullable(),
  bajadaCount: z.number().int().min(1).max(60),
  hardware: hardwareSchema,
  serviceProviderId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  powerSupply: z.enum(["MONOPHASE", "THREEPHASE"]).optional().nullable(),
});

function parseBoolQuery(value: unknown): boolean {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0" || value == null) return false;
  return false;
}

tamboRequestsRouter.get(
  "/equipment-preview",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  (req, res) => {
    const bajadaCount = Number(req.query.bajadaCount);
    if (!Number.isInteger(bajadaCount) || bajadaCount < 1 || bajadaCount > 60) {
      res.status(400).json({ error: "bajadaCount debe ser un entero entre 1 y 60" });
      return;
    }
    const hardware = {
      pumpSensor: parseBoolQuery(req.query.pumpSensor),
      flowMeters: parseBoolQuery(req.query.flowMeters),
      rfidReaders: parseBoolQuery(req.query.rfidReaders),
    };
    res.json({ items: calculateEquipmentList(bajadaCount, hardware), hardware });
  },
);

tamboRequestsRouter.post(
  "/",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const { name, bajadaCount, hardware } = parsed.data;
    const address = parsed.data.address?.trim() || null;
    const notes = parsed.data.notes?.trim() || null;
    const wantsHardware = hasHardware(hardware);
    const serviceProviderId = parsed.data.serviceProviderId ?? null;

    if (wantsHardware) {
      if (!parsed.data.powerSupply) {
        throw new HttpError(
          400,
          "Si el pedido incluye hardware hay que indicar la corriente (monofásica o trifásica).",
        );
      }
      if (!serviceProviderId) {
        throw new HttpError(
          400,
          "Si el pedido incluye hardware hay que elegir un proveedor del catálogo.",
        );
      }
      const provider = await prisma.serviceProvider.findFirst({
        where: { id: serviceProviderId, active: true },
      });
      if (!provider) throw new HttpError(404, "Proveedor no encontrado o inactivo");
    } else if (serviceProviderId) {
      throw new HttpError(400, "Un pedido solo-software no lleva proveedor.");
    }

    const item = await prisma.tamboRequest.create({
      data: {
        tenantId: auth.tenantId,
        requestedById: auth.userId,
        name,
        address,
        bajadaCount,
        hardware,
        equipmentList: calculateEquipmentList(bajadaCount, hardware),
        serviceProviderId: wantsHardware ? serviceProviderId : null,
        notes,
        powerSupply: parsed.data.powerSupply ?? null,
        status: "SENT",
      },
      include: tamboRequestInclude,
    });

    res.status(201).json({ item: serializeTamboRequest(item) });
  },
);

tamboRequestsRouter.get(
  "/",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const auth = req.auth!;
    const [items, catalog] = await Promise.all([
      prisma.tamboRequest.findMany({
        where: { tenantId: auth.tenantId },
        include: tamboRequestInclude,
        orderBy: { createdAt: "desc" },
      }),
      prisma.serviceProvider.findMany({
        where: { active: true },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        select: { id: true, name: true },
      }),
    ]);

    res.json({
      items: items.map(serializeTamboRequest),
      serviceProviders: catalog,
    });
  },
);

tamboRequestsRouter.post(
  "/:id/accept",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const existing = await prisma.tamboRequest.findFirst({
      where: { id: idParsed.data, tenantId: req.auth!.tenantId },
    });
    if (!existing) throw new HttpError(404, "Pedido no encontrado");
    if (existing.status !== "QUOTED") {
      throw new HttpError(409, "Solo se puede aceptar un pedido cotizado.");
    }

    const item = await prisma.tamboRequest.update({
      where: { id: existing.id },
      data: { status: "ACCEPTED" },
      include: tamboRequestInclude,
    });
    res.json({ item: serializeTamboRequest(item) });
  },
);

tamboRequestsRouter.post(
  "/:id/decline",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = z
      .object({ reason: z.string().trim().max(500).optional().nullable() })
      .safeParse(req.body ?? {});
    if (!body.success) {
      res.status(400).json({ error: "Invalid body", details: body.error.flatten() });
      return;
    }

    const existing = await prisma.tamboRequest.findFirst({
      where: { id: idParsed.data, tenantId: req.auth!.tenantId },
    });
    if (!existing) throw new HttpError(404, "Pedido no encontrado");
    if (existing.status !== "QUOTED") {
      throw new HttpError(409, "Solo se puede rechazar un pedido cotizado.");
    }

    const item = await prisma.tamboRequest.update({
      where: { id: existing.id },
      data: {
        status: "DECLINED",
        rejectionReason: body.data.reason?.trim() || existing.rejectionReason,
      },
      include: tamboRequestInclude,
    });
    res.json({ item: serializeTamboRequest(item) });
  },
);

tamboRequestsRouter.post(
  "/:id/cancel",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const idParsed = z.string().uuid().safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const existing = await prisma.tamboRequest.findFirst({
      where: { id: idParsed.data, tenantId: req.auth!.tenantId },
    });
    if (!existing) throw new HttpError(404, "Pedido no encontrado");
    if (existing.status !== "SENT" && existing.status !== "QUOTED") {
      throw new HttpError(409, "Solo se puede cancelar un pedido enviado o cotizado.");
    }

    const item = await prisma.tamboRequest.update({
      where: { id: existing.id },
      data: { status: "CANCELLED" },
      include: tamboRequestInclude,
    });
    res.json({ item: serializeTamboRequest(item) });
  },
);
