import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

export const controlLecherosRouter = Router();

const isoDateTime = z.string().min(1).refine((v) => !Number.isNaN(Date.parse(v)), {
  message: "Invalid ISO datetime",
});

const lineSchema = z.object({
  animalId: z.string().uuid(),
  bajadaNumber: z.number().int().positive(),
  liters: z.number().positive(),
});

const createSchema = z.object({
  id: z.string().uuid().optional(),
  tamboId: z.string().uuid(),
  performedAt: isoDateTime,
  source: z.enum(["EXTERNAL_TECHNICIAN", "FLOW_METER"]).optional().default("EXTERNAL_TECHNICIAN"),
  technicianName: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  clientMutationId: z.string().min(1).max(100).optional(),
  lines: z.array(lineSchema).min(1),
});

const listSchema = z.object({
  tamboId: z.string().uuid(),
  status: z.enum(["ACTIVE", "VOIDED", "ALL"]).optional().default("ACTIVE"),
});

function mapPrismaError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new HttpError(409, "Conflict: duplicate clientMutationId");
  }
  throw err;
}

controlLecherosRouter.get("/", authenticate, async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    return;
  }

  const auth = req.auth!;
  const { tamboId, status } = parsed.data;
  await requireTamboInTenant(auth, tamboId);

  const items = await prisma.controlLechero.findMany({
    where: {
      tenantId: auth.tenantId,
      tamboId,
      ...(status === "ALL" ? {} : { status }),
    },
    include: {
      lines: {
        include: { animal: { select: { id: true, earTag: true } } },
      },
    },
    orderBy: { performedAt: "desc" },
    take: 30,
  });

  res.json({ items });
});

controlLecherosRouter.post(
  "/",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "VETERINARIO"),
  async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const data = parsed.data;
    await requireTamboInTenant(auth, data.tamboId);

    const animalIds = [...new Set(data.lines.map((l) => l.animalId))];
    const animals = await prisma.animal.findMany({
      where: {
        id: { in: animalIds },
        tenantId: auth.tenantId,
        tamboId: data.tamboId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (animals.length !== animalIds.length) {
      throw new HttpError(404, "One or more animals not found in this tambo");
    }

    try {
      const item = await prisma.controlLechero.create({
        data: {
          ...(data.id ? { id: data.id } : {}),
          tenantId: auth.tenantId,
          tamboId: data.tamboId,
          performedAt: new Date(data.performedAt),
          source: data.source,
          technicianName: data.technicianName,
          notes: data.notes,
          clientMutationId: data.clientMutationId,
          createdById: auth.userId,
          status: "ACTIVE",
          lines: {
            create: data.lines.map((line) => ({
              tenantId: auth.tenantId,
              tamboId: data.tamboId,
              animalId: line.animalId,
              bajadaNumber: line.bajadaNumber,
              liters: line.liters,
            })),
          },
        },
        include: { lines: true },
      });
      res.status(201).json({ item });
    } catch (err) {
      mapPrismaError(err);
    }
  },
);
