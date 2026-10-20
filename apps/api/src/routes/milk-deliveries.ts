import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";
import { assertTenantPhotoUrls } from "../lib/photo-url.js";
import {
  addDaysIso,
  compareDelivery,
  compareMoments,
  dateOnly,
  isIsoDate,
  type ComparisonSession,
  type MilkingShiftName,
} from "../lib/milk-comparison.js";

export const milkDeliveriesRouter = Router();

const isoDateTime = z.string().min(1).refine((v) => !Number.isNaN(Date.parse(v)), {
  message: "Invalid ISO datetime",
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isIsoDate, {
  message: "Invalid date",
});

const pickupFields = {
  pickupDate: isoDate.optional().nullable(),
  pickupShift: z.enum(["MORNING", "AFTERNOON"]).optional().nullable(),
  guacheraLiters: z.number().nonnegative().optional().nullable(),
  ticketPhotoUrl: z.string().min(1).max(2000).optional().nullable(),
};

function pickupTogether(
  data: { pickupDate?: string | null; pickupShift?: "MORNING" | "AFTERNOON" | null },
  ctx: z.RefinementCtx,
) {
  const hasDate = data.pickupDate != null && data.pickupDate !== "";
  const hasShift = data.pickupShift != null;
  if (hasDate !== hasShift) {
    ctx.addIssue({
      code: "custom",
      message: "pickupDate y pickupShift van juntos",
      path: hasDate ? ["pickupShift"] : ["pickupDate"],
    });
  }
}

const createSchema = z
  .object({
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
    ...pickupFields,
  })
  .superRefine(pickupTogether);

const listSchema = z.object({
  tamboId: z.string().uuid(),
  status: z.enum(["ACTIVE", "VOIDED", "ALL"]).optional().default("ACTIVE"),
});

const comparisonsQuery = z.object({
  tamboId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

const correctSchema = z
  .object({
    id: z.string().uuid().optional(),
    coldTankLiters: z.number().nonnegative(),
    truckDeclaredLiters: z.number().nonnegative(),
    coldTankTemperatureC: z.number().optional().nullable(),
    truckTemperatureC: z.number().optional().nullable(),
    notes: z.string().max(2000).optional(),
    clientMutationId: z.string().min(1).max(100).optional(),
    ...pickupFields,
  })
  .superRefine(pickupTogether);

function num(value: { toNumber(): number } | number | string | null | undefined): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return value.toNumber();
}

function numOrNull(
  value: { toNumber(): number } | number | string | null | undefined,
): number | null {
  if (value == null) return null;
  return num(value);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function assertPickupNotTooFuture(pickupDate: string | null | undefined) {
  if (!pickupDate) return;
  const max = addDaysIso(todayIso(), 1);
  if (pickupDate > max) {
    throw new HttpError(400, "La fecha del camión no puede ser más de un día en el futuro");
  }
}

function pickupDateValue(value: string | null | undefined): Date | null {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

function serializeDelivery<T extends {
  pickupDate: Date | null;
  coldTankLiters: unknown;
  truckDeclaredLiters: unknown;
  coldTankTemperatureC: unknown;
  truckTemperatureC: unknown;
  guacheraLiters: unknown;
}>(row: T) {
  return {
    ...row,
    pickupDate: dateOnly(row.pickupDate),
    coldTankLiters: num(row.coldTankLiters as number),
    truckDeclaredLiters: num(row.truckDeclaredLiters as number),
    coldTankTemperatureC: numOrNull(row.coldTankTemperatureC as number | null),
    truckTemperatureC: numOrNull(row.truckTemperatureC as number | null),
    guacheraLiters: numOrNull(row.guacheraLiters as number | null),
  };
}

function mapPrismaError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = err.meta?.target;
    const asText = Array.isArray(target)
      ? target.join(",")
      : typeof target === "string"
        ? target
        : JSON.stringify(target ?? "");
    if (
      asText.includes("pickup") ||
      asText.includes("milk_deliveries_one_active_per_pickup")
    ) {
      throw new HttpError(409, "Ya hay una entrega cargada para ese momento");
    }
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

  res.json({ items: items.map(serializeDelivery) });
});

milkDeliveriesRouter.get(
  "/comparisons",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const parsed = comparisonsQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const { tamboId, limit } = parsed.data;
    await requireTamboInTenant(auth, tamboId);

    const [tambo, deliveries] = await Promise.all([
      prisma.tambo.findFirst({
        where: { id: tamboId, tenantId: auth.tenantId },
        select: { deliveryDiffThresholdPct: true },
      }),
      prisma.milkDelivery.findMany({
        where: { tenantId: auth.tenantId, tamboId, status: "ACTIVE" },
      }),
    ]);
    if (!tambo) throw new HttpError(404, "Tambo not found");

    const thresholdPct = numOrNull(tambo.deliveryDiffThresholdPct);

    const withMoment = deliveries
      .filter((d) => d.pickupDate && d.pickupShift)
      .sort((a, b) =>
        compareMoments(
          { date: dateOnly(a.pickupDate)!, shift: a.pickupShift as MilkingShiftName },
          { date: dateOnly(b.pickupDate)!, shift: b.pickupShift as MilkingShiftName },
        ),
      );
    const withoutMoment = deliveries.filter((d) => !d.pickupDate || !d.pickupShift);

    const start = Math.max(0, withMoment.length - limit);
    const window = withMoment.slice(start);

    let sessions: ComparisonSession[] = [];
    if (window.length > 0) {
      const rangeStart =
        start === 0
          ? dateOnly(window[0]!.pickupDate)!
          : dateOnly(withMoment[start - 1]!.pickupDate)!;
      const rangeEnd = dateOnly(window[window.length - 1]!.pickupDate)!;
      const rows = await prisma.milkingSession.findMany({
        where: {
          tenantId: auth.tenantId,
          tamboId,
          sessionDate: {
            gte: new Date(`${rangeStart}T00:00:00.000Z`),
            lte: new Date(`${rangeEnd}T00:00:00.000Z`),
          },
        },
        select: { sessionDate: true, shift: true, totalLiters: true, status: true },
      });
      sessions = rows.map((s) => ({
        sessionDate: dateOnly(s.sessionDate)!,
        shift: s.shift,
        totalLiters: num(s.totalLiters),
        status: s.status,
      }));
    }

    const items = [
      ...window.map((row, i) => {
        const globalIndex = start + i;
        const previous = globalIndex === 0 ? null : withMoment[globalIndex - 1]!;
        const comparison = compareDelivery({
          delivery: {
            pickupDate: dateOnly(row.pickupDate),
            pickupShift: row.pickupShift,
            truckDeclaredLiters: num(row.truckDeclaredLiters),
            guacheraLiters: numOrNull(row.guacheraLiters),
          },
          previous: previous
            ? {
                pickupDate: dateOnly(previous.pickupDate),
                pickupShift: previous.pickupShift,
                truckDeclaredLiters: num(previous.truckDeclaredLiters),
                guacheraLiters: numOrNull(previous.guacheraLiters),
              }
            : null,
          sessions,
          thresholdPct,
        });
        return {
          delivery: serializeDelivery(row),
          previous: previous
            ? {
                id: previous.id,
                pickupDate: dateOnly(previous.pickupDate),
                pickupShift: previous.pickupShift,
              }
            : null,
          comparison,
        };
      }),
      ...withoutMoment.map((row) => ({
        delivery: serializeDelivery(row),
        previous: null,
        comparison: compareDelivery({
          delivery: {
            pickupDate: null,
            pickupShift: null,
            truckDeclaredLiters: num(row.truckDeclaredLiters),
            guacheraLiters: numOrNull(row.guacheraLiters),
          },
          previous: null,
          sessions: [],
          thresholdPct,
        }),
      })),
    ];

    res.json({ items, thresholdPct });
  },
);

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
    assertPickupNotTooFuture(data.pickupDate ?? null);
    if (data.ticketPhotoUrl) {
      assertTenantPhotoUrls([data.ticketPhotoUrl], auth.tenantId);
    }

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
          pickupDate: pickupDateValue(data.pickupDate ?? null),
          pickupShift: data.pickupShift ?? null,
          guacheraLiters: data.guacheraLiters ?? null,
          ticketPhotoUrl: data.ticketPhotoUrl ?? null,
          notes: data.notes,
          clientMutationId: data.clientMutationId,
          createdById: auth.userId,
          status: "ACTIVE",
        },
      });
      res.status(201).json({ item: serializeDelivery(item) });
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

    const nextPickupDate =
      parsed.data.pickupDate !== undefined
        ? parsed.data.pickupDate
        : dateOnly(original.pickupDate);
    const nextPickupShift =
      parsed.data.pickupShift !== undefined
        ? parsed.data.pickupShift
        : original.pickupShift;
    assertPickupNotTooFuture(nextPickupDate);
    if (parsed.data.ticketPhotoUrl) {
      assertTenantPhotoUrls([parsed.data.ticketPhotoUrl], auth.tenantId);
    }

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
            pickupDate: pickupDateValue(nextPickupDate),
            pickupShift: nextPickupShift,
            guacheraLiters:
              parsed.data.guacheraLiters !== undefined
                ? parsed.data.guacheraLiters
                : original.guacheraLiters,
            ticketPhotoUrl:
              parsed.data.ticketPhotoUrl !== undefined
                ? parsed.data.ticketPhotoUrl
                : original.ticketPhotoUrl,
            notes: parsed.data.notes,
            clientMutationId: parsed.data.clientMutationId,
            createdById: auth.userId,
            status: "ACTIVE",
            correctsDeliveryId: original.id,
          },
        });
        return { voided: serializeDelivery(voided), corrected: serializeDelivery(corrected) };
      });
      res.status(201).json(result);
    } catch (err) {
      mapPrismaError(err);
    }
  },
);
