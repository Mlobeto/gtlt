import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

export const animalsRouter = Router();

const statusSchema = z.enum(["ACTIVE", "DRY", "SOLD", "DEAD"]);

const createSchema = z.object({
  id: z.string().uuid().optional(),
  tamboId: z.string().uuid(),
  earTag: z.string().trim().min(1).max(50),
  status: statusSchema.optional().default("ACTIVE"),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  enteredAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  photoUrl: z.string().url().optional(),
  notes: z.string().max(2000).optional(),
  clientMutationId: z.string().min(1).max(100).optional(),
});

const listSchema = z.object({
  tamboId: z.string().uuid(),
  status: statusSchema.optional(),
  q: z.string().trim().min(1).max(50).optional(),
});

function mapPrismaError(err: unknown): never {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    throw new HttpError(
      409,
      "Conflict: ear tag already active in this tambo, or duplicate clientMutationId",
    );
  }
  throw err;
}

animalsRouter.get("/", authenticate, async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    return;
  }

  const auth = req.auth!;
  const { tamboId, status, q } = parsed.data;
  await requireTamboInTenant(auth, tamboId);

  const items = await prisma.animal.findMany({
    where: {
      tenantId: auth.tenantId,
      tamboId,
      deletedAt: null,
      ...(status ? { status } : { status: { in: ["ACTIVE", "DRY"] } }),
      ...(q ? { earTag: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { earTag: "asc" },
  });

  res.json({ items });
});

animalsRouter.post(
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
      const animal = await prisma.animal.create({
        data: {
          ...(data.id ? { id: data.id } : {}),
          tenantId: auth.tenantId,
          tamboId: data.tamboId,
          earTag: data.earTag,
          status: data.status,
          birthDate: data.birthDate
            ? new Date(`${data.birthDate}T00:00:00.000Z`)
            : undefined,
          enteredAt: data.enteredAt
            ? new Date(`${data.enteredAt}T00:00:00.000Z`)
            : undefined,
          photoUrl: data.photoUrl,
          notes: data.notes,
          clientMutationId: data.clientMutationId,
          createdById: auth.userId,
        },
      });
      res.status(201).json({ item: animal });
    } catch (err) {
      mapPrismaError(err);
    }
  },
);
