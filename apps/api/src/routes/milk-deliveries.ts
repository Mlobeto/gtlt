import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

export const milkDeliveriesRouter = Router();

const isoDateTime = z.string().min(1).refine((v) => !Number.isNaN(Date.parse(v)), {
  message: "Invalid ISO datetime",
});

const createSchema = z.object({
  id: z.string().uuid().optional(),
  tamboId: z.string().uuid(),
  periodStart: isoDateTime,
  periodEnd: isoDateTime,
  coldTankLiters: z.number().nonnegative(),
  truckDeclaredLiters: z.number().nonnegative(),
  coldTankTemperatureC: z.number().optional().nullable(),
  truckTemperatureC: z.number().optional().nullable(),
  notes: z.string().max(2000).optional(),
  clientMutationId: z.string().min(1).max(100).optional(),
});

const listSchema = z.object({
  tamboId: z.string().uuid(),
  status: z.enum(["ACTIVE", "VOIDED", "ALL"]).optional().default("ACTIVE"),
});

const correctSchema = z.object({
  id: z.string().uuid().optional(),
  coldTankLiters: z.number().nonnegative(),
  truckDeclaredLiters: z.number().nonnegative(),
  coldTankTemperatureC: z.number().optional().nullable(),
  truckTemperatureC: z.number().optional().nullable(),
  notes: z.string().max(2000).optional(),
  clientMutationId: z.string().min(1).max(100).optional(),
});

function mapPrismaError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new HttpError(409, "Conflict: duplicate clientMutationId");
  }
  throw err;
}

milkDeliveriesRouter.get("/", authenticate, async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    return;
  }

  const auth = req.auth!;
  const { tamboId, status } = parsed.data;
  await requireTamboInTenant(auth, tamboId);

  const items = await prisma.milkDelivery.findMany({
    where: {
      tenantId: auth.tenantId,
      tamboId,
      ...(status === "ALL" ? {} : { status }),
    },
    orderBy: { periodEnd: "desc" },
    take: 50,
  });

  res.json({ items });
});

milkDeliveriesRouter.post(
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

    try {
      const item = await prisma.milkDelivery.create({
        data: {
          ...(data.id ? { id: data.id } : {}),
          tenantId: auth.tenantId,
          tamboId: data.tamboId,
          periodStart: new Date(data.periodStart),
          periodEnd: new Date(data.periodEnd),
          coldTankLiters: data.coldTankLiters,
          truckDeclaredLiters: data.truckDeclaredLiters,
          coldTankTemperatureC: data.coldTankTemperatureC ?? null,
          truckTemperatureC: data.truckTemperatureC ?? null,
          notes: data.notes,
          clientMutationId: data.clientMutationId,
          createdById: auth.userId,
          status: "ACTIVE",
        },
      });
      res.status(201).json({ item });
    } catch (err) {
      mapPrismaError(err);
    }
  },
);

milkDeliveriesRouter.post(
  "/:id/correct",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN"),
  async (req, res) => {
    const parsed = correctSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const deliveryId = String(req.params.id);
    const original = await prisma.milkDelivery.findFirst({
      where: { id: deliveryId, tenantId: auth.tenantId },
    });
    if (!original) throw new HttpError(404, "Milk delivery not found");
    if (original.status !== "ACTIVE") {
      throw new HttpError(409, "Only ACTIVE deliveries can be corrected");
    }
    await requireTamboInTenant(auth, original.tamboId);

    try {
      const result = await prisma.$transaction(async (tx) => {
        const voided = await tx.milkDelivery.update({
          where: { id: original.id },
          data: { status: "VOIDED" },
        });
        const corrected = await tx.milkDelivery.create({
          data: {
            ...(parsed.data.id ? { id: parsed.data.id } : {}),
            tenantId: auth.tenantId,
            tamboId: original.tamboId,
            periodStart: original.periodStart,
            periodEnd: original.periodEnd,
            coldTankLiters: parsed.data.coldTankLiters,
            truckDeclaredLiters: parsed.data.truckDeclaredLiters,
            coldTankTemperatureC: parsed.data.coldTankTemperatureC ?? null,
            truckTemperatureC: parsed.data.truckTemperatureC ?? null,
            notes: parsed.data.notes,
            clientMutationId: parsed.data.clientMutationId,
            createdById: auth.userId,
            status: "ACTIVE",
            correctsDeliveryId: original.id,
          },
        });
        return { voided, corrected };
      });
      res.status(201).json(result);
    } catch (err) {
      mapPrismaError(err);
    }
  },
);
