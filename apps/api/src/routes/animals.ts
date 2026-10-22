import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";
import {
  argentinaToday,
  deriveAlerts,
  deriveLactation,
  derivePregnancy,
  utcDay,
} from "../lib/animal-insights.js";
import {
  buildPedigree,
  dateOnly as pedigreeDateOnly,
  listOffspring,
  type PedigreeAnimal,
  type PedigreeSire,
} from "../lib/pedigree.js";

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
  photoUrl: z.string().max(2000).url().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  breed: z.string().trim().max(120).optional().nullable(),
  motherId: z.string().uuid().optional().nullable(),
  sireId: z.string().uuid().optional().nullable(),
  clientMutationId: z.string().min(1).max(100).optional(),
});

const patchSchema = z.object({
  earTag: z.string().trim().min(1).max(50).optional(),
  status: statusSchema.optional(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  enteredAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  photoUrl: z.string().max(2000).url().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  breed: z.string().trim().max(120).optional().nullable(),
  motherId: z.string().uuid().optional().nullable(),
  sireId: z.string().uuid().optional().nullable(),
  clientMutationId: z.string().min(1).max(100).optional(),
  version: z.number().int().positive().optional(),
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

function dateOnly(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

function litersNum(value: { toNumber(): number } | number | string): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return value.toNumber();
}

/** motherId → debe existir en el mismo tenant (puede estar en otro tambo si se transfirió). */
async function requireMotherInTenant(tenantId: string, motherId: string) {
  const mother = await prisma.animal.findFirst({
    where: { id: motherId, tenantId, deletedAt: null },
  });
  if (!mother) throw new HttpError(404, "Mother animal not found in this tenant");
}

/** sireId → debe existir en el catálogo Sire del mismo tenant. */
async function requireSireInTenant(tenantId: string, sireId: string) {
  const sire = await prisma.sire.findFirst({ where: { id: sireId, tenantId } });
  if (!sire) throw new HttpError(404, "Sire not found in this tenant");
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

animalsRouter.get("/consult-photos", authenticate, async (req, res) => {
  const parsed = z
    .object({
      tamboId: z.string().uuid(),
      unreviewedOnly: z.enum(["true", "false"]).optional(),
    })
    .safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    return;
  }

  const auth = req.auth!;
  await requireTamboInTenant(auth, parsed.data.tamboId);
  const unreviewedOnly = parsed.data.unreviewedOnly !== "false";

  const items = await prisma.animalPhoto.findMany({
    where: {
      tenantId: auth.tenantId,
      tamboId: parsed.data.tamboId,
      type: "CONSULT",
      ...(unreviewedOnly ? { reviewedAt: null } : {}),
    },
    include: {
      animal: { select: { id: true, earTag: true } },
    },
    orderBy: { takenAt: "desc" },
    take: 100,
  });

  res.json({ items });
});

/** Ficha + historial sanitario/reproductivo reciente (para UI dueño/tambero/vet). */
animalsRouter.get("/:id", authenticate, async (req, res) => {
  const auth = req.auth!;
  const id = String(req.params.id);

  const animal = await prisma.animal.findFirst({
    where: { id, tenantId: auth.tenantId, deletedAt: null },
  });
  if (!animal) throw new HttpError(404, "Animal not found");
  await requireTamboInTenant(auth, animal.tamboId);

  const [healthEvents, reproEvents, controlLines] = await Promise.all([
    prisma.healthEvent.findMany({
      where: { tenantId: auth.tenantId, animalId: id, deletedAt: null },
      orderBy: { eventAt: "desc" },
      take: 50,
    }),
    prisma.reproEvent.findMany({
      where: { tenantId: auth.tenantId, animalId: id, deletedAt: null },
      orderBy: { eventAt: "desc" },
      take: 50,
    }),
    prisma.controlLecheroLine.findMany({
      where: { tenantId: auth.tenantId, animalId: id },
      include: {
        controlLechero: { select: { id: true, performedAt: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  const history = [
    ...healthEvents.map((e) => ({
      kind: "health" as const,
      id: e.id,
      at: e.eventAt.toISOString(),
      type: e.type,
      summary: e.productName ?? e.type,
      notes: e.notes,
      productName: e.productName,
      milkWithdrawalUntil: e.milkWithdrawalUntil?.toISOString() ?? null,
    })),
    ...reproEvents.map((e) => ({
      kind: "repro" as const,
      id: e.id,
      at: e.eventAt.toISOString(),
      type: e.type,
      summary: e.type,
      notes: e.notes,
      expectedCalvingAt: dateOnly(e.expectedCalvingAt),
    })),
    ...controlLines
      .filter((l) => l.controlLechero.status === "ACTIVE")
      .map((l) => ({
        kind: "control" as const,
        id: l.id,
        at: l.controlLechero.performedAt.toISOString(),
        type: "CONTROL_LECHERO",
        summary: `Bajada ${l.bajadaNumber} · ${litersNum(l.liters)} L`,
        notes: null as string | null,
        liters: litersNum(l.liters),
        bajadaNumber: l.bajadaNumber,
      })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  res.json({
    item: {
      ...animal,
      birthDate: dateOnly(animal.birthDate),
      enteredAt: dateOnly(animal.enteredAt),
    },
    history,
  });
});

animalsRouter.patch(
  "/:id",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "VETERINARIO"),
  async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const id = String(req.params.id);
    const data = parsed.data;

    const existing = await prisma.animal.findFirst({
      where: { id, tenantId: auth.tenantId, deletedAt: null },
    });
    if (!existing) throw new HttpError(404, "Animal not found");
    await requireTamboInTenant(auth, existing.tamboId);

    if (data.version != null && data.version !== existing.version) {
      throw new HttpError(409, "Conflict: animal was updated elsewhere (version mismatch)");
    }

    if (data.motherId) await requireMotherInTenant(auth.tenantId, data.motherId);
    if (data.sireId) await requireSireInTenant(auth.tenantId, data.sireId);

    try {
      const item = await prisma.animal.update({
        where: { id },
        data: {
          ...(data.earTag != null ? { earTag: data.earTag } : {}),
          ...(data.status != null ? { status: data.status } : {}),
          ...(data.birthDate !== undefined
            ? {
                birthDate: data.birthDate
                  ? new Date(`${data.birthDate}T00:00:00.000Z`)
                  : null,
              }
            : {}),
          ...(data.enteredAt !== undefined
            ? {
                enteredAt: data.enteredAt
                  ? new Date(`${data.enteredAt}T00:00:00.000Z`)
                  : null,
              }
            : {}),
          ...(data.photoUrl !== undefined ? { photoUrl: data.photoUrl } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.breed !== undefined ? { breed: data.breed } : {}),
          ...(data.motherId !== undefined ? { motherId: data.motherId } : {}),
          ...(data.sireId !== undefined ? { sireId: data.sireId } : {}),
          ...(data.clientMutationId != null
            ? { clientMutationId: data.clientMutationId }
            : {}),
          version: { increment: 1 },
        },
      });
      res.json({
        item: {
          ...item,
          birthDate: dateOnly(item.birthDate),
          enteredAt: dateOnly(item.enteredAt),
        },
      });
    } catch (err) {
      mapPrismaError(err);
    }
  },
);

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

    if (data.motherId) await requireMotherInTenant(auth.tenantId, data.motherId);
    if (data.sireId) await requireSireInTenant(auth.tenantId, data.sireId);

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
          breed: data.breed,
          motherId: data.motherId ?? undefined,
          sireId: data.sireId ?? undefined,
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

/**
 * Timeline unificado para la pantalla de ficha: junta HealthEvent, ReproEvent,
 * AnimalTransferEvent, ControlLecheroLine, WeightEvent y AnimalPhoto en un solo
 * array ordenado por fecha. `kind` identifica de qué tabla vino cada item.
 * No es una tabla de eventos unificada, es una query que compone.
 */
animalsRouter.get("/:id/timeline", authenticate, async (req, res) => {
  const auth = req.auth!;
  const id = String(req.params.id);

  const animal = await prisma.animal.findFirst({
    where: { id, tenantId: auth.tenantId, deletedAt: null },
  });
  if (!animal) throw new HttpError(404, "Animal not found");
  await requireTamboInTenant(auth, animal.tamboId);

  const [healthEvents, reproEvents, transfers, controlLines, weightEvents, photos] =
    await Promise.all([
      prisma.healthEvent.findMany({
        where: { tenantId: auth.tenantId, animalId: id, deletedAt: null },
        orderBy: { eventAt: "desc" },
        take: 100,
      }),
      prisma.reproEvent.findMany({
        where: { tenantId: auth.tenantId, animalId: id, deletedAt: null },
        orderBy: { eventAt: "desc" },
        take: 100,
      }),
      prisma.animalTransferEvent.findMany({
        where: { tenantId: auth.tenantId, animalId: id },
        include: {
          fromTambo: { select: { id: true, name: true } },
          toTambo: { select: { id: true, name: true } },
        },
        orderBy: { transferredAt: "desc" },
        take: 50,
      }),
      prisma.controlLecheroLine.findMany({
        where: { tenantId: auth.tenantId, animalId: id },
        include: {
          controlLechero: { select: { id: true, performedAt: true, status: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.weightEvent.findMany({
        where: { tenantId: auth.tenantId, animalId: id },
        orderBy: { measuredAt: "desc" },
        take: 50,
      }),
      prisma.animalPhoto.findMany({
        where: { tenantId: auth.tenantId, animalId: id },
        orderBy: { takenAt: "desc" },
        take: 50,
      }),
    ]);

  const items = [
    ...healthEvents.map((e) => ({
      kind: "health" as const,
      id: e.id,
      at: e.eventAt.toISOString(),
      type: e.type,
      summary: e.productName ?? e.type,
      notes: e.notes,
      productName: e.productName,
      milkWithdrawalUntil: e.milkWithdrawalUntil?.toISOString() ?? null,
    })),
    ...reproEvents.map((e) => ({
      kind: "repro" as const,
      id: e.id,
      at: e.eventAt.toISOString(),
      type: e.type,
      summary: e.type,
      notes: e.notes,
      expectedCalvingAt: dateOnly(e.expectedCalvingAt),
      sireId: e.sireId,
    })),
    ...transfers.map((t) => ({
      kind: "transfer" as const,
      id: t.id,
      at: t.transferredAt.toISOString(),
      type: "TRANSFER",
      summary: `${t.fromTambo.name} → ${t.toTambo.name}`,
      notes: t.notes,
    })),
    ...controlLines
      .filter((l) => l.controlLechero.status === "ACTIVE")
      .map((l) => ({
        kind: "control" as const,
        id: l.id,
        at: l.controlLechero.performedAt.toISOString(),
        type: "CONTROL_LECHERO",
        summary: `Bajada ${l.bajadaNumber} · ${litersNum(l.liters)} L`,
        notes: null as string | null,
        liters: litersNum(l.liters),
        bajadaNumber: l.bajadaNumber,
      })),
    ...weightEvents.map((w) => ({
      kind: "weight" as const,
      id: w.id,
      at: w.measuredAt.toISOString(),
      type: w.method,
      summary: `${w.weightKg} kg`,
      notes: w.notes,
    })),
    ...photos.map((p) => ({
      kind: "photo" as const,
      id: p.id,
      at: p.takenAt.toISOString(),
      type: p.type,
      summary: p.type === "CONSULT" ? "Foto de consulta" : "Foto de perfil",
      notes: p.note,
      photoUrl: p.photoUrl,
      reviewedAt: p.reviewedAt?.toISOString() ?? null,
    })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));

  res.json({ items });
});

const summaryTodaySchema = z.object({
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

animalsRouter.get("/:id/summary", authenticate, async (req, res) => {
  const parsed = summaryTodaySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    return;
  }

  const auth = req.auth!;
  const id = String(req.params.id);
  const today = parsed.data.today ?? argentinaToday();

  const animal = await prisma.animal.findFirst({
    where: { id, tenantId: auth.tenantId, deletedAt: null },
    include: {
      mother: { select: { id: true, earTag: true, deletedAt: true } },
      sire: { select: { id: true, name: true, registrationCode: true } },
    },
  });
  if (!animal) throw new HttpError(404, "Animal not found");
  await requireTamboInTenant(auth, animal.tamboId);

  const [reproEvents, healthEvents, controlLines] = await Promise.all([
    prisma.reproEvent.findMany({
      where: { tenantId: auth.tenantId, animalId: id, deletedAt: null },
      orderBy: { eventAt: "desc" },
    }),
    prisma.healthEvent.findMany({
      where: { tenantId: auth.tenantId, animalId: id, deletedAt: null },
      orderBy: { eventAt: "desc" },
    }),
    prisma.controlLecheroLine.findMany({
      where: {
        tenantId: auth.tenantId,
        animalId: id,
        controlLechero: { status: "ACTIVE" },
      },
      include: { controlLechero: { select: { performedAt: true } } },
      orderBy: { controlLechero: { performedAt: "desc" } },
      take: 2,
    }),
  ]);

  const pregnancy = derivePregnancy(
    reproEvents.map((e) => ({
      type: e.type,
      eventAt: e.eventAt.toISOString(),
      expectedCalvingAt: dateOnly(e.expectedCalvingAt),
    })),
  );

  const calvings = reproEvents
    .filter((e) => e.type === "CALVING")
    .map((e) => ({ eventAt: e.eventAt.toISOString() }));
  const lactation = deriveLactation({
    status: animal.status,
    calvings,
    today,
  });

  let withdrawalUntil: string | null = null;
  for (const h of healthEvents) {
    if (!h.milkWithdrawalUntil) continue;
    const until = dateOnly(h.milkWithdrawalUntil);
    if (!until) continue;
    if (!withdrawalUntil || utcDay(until) > utcDay(withdrawalUntil)) {
      withdrawalUntil = until;
    }
  }

  const alerts = deriveAlerts({
    status: animal.status,
    pregnancy,
    withdrawalUntil,
    today,
  });

  const [last, previous] = controlLines;
  const toControl = (row: (typeof controlLines)[number] | undefined) =>
    row
      ? {
          performedAt: row.controlLechero.performedAt.toISOString(),
          liters: litersNum(row.liters),
          bajadaNumber: row.bajadaNumber,
        }
      : null;

  const { mother, sire, ...animalRow } = animal;
  res.json({
    animal: {
      ...animalRow,
      birthDate: dateOnly(animal.birthDate),
      enteredAt: dateOnly(animal.enteredAt),
    },
    mother: mother && !mother.deletedAt ? { id: mother.id, earTag: mother.earTag } : null,
    sire: sire ? { id: sire.id, name: sire.name, registrationCode: sire.registrationCode } : null,
    pregnancy,
    lactation,
    alerts,
    lastControl: toControl(last),
    previousControl: toControl(previous),
  });
});

const genealogyQuerySchema = z.object({
  generations: z.coerce.number().int().min(1).max(4).optional().default(3),
});

function toPedigreeAnimal(
  row: {
    id: string;
    earTag: string;
    status: string;
    birthDate: Date | null;
    breed: string | null;
    photoUrl: string | null;
    tamboId: string;
    motherId: string | null;
    sireId: string | null;
    deletedAt: Date | null;
    tambo: { id: string; name: string };
  },
): PedigreeAnimal {
  return {
    id: row.id,
    earTag: row.earTag,
    status: row.status,
    birthDate: pedigreeDateOnly(row.birthDate),
    breed: row.breed,
    photoUrl: row.photoUrl,
    tamboId: row.tamboId,
    tamboName: row.tambo.name,
    motherId: row.motherId,
    sireId: row.sireId,
    deletedAt: row.deletedAt,
  };
}

animalsRouter.get("/:id/genealogy", authenticate, async (req, res) => {
  const parsed = genealogyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    return;
  }

  const auth = req.auth!;
  const id = String(req.params.id);
  const generations = parsed.data.generations;

  const root = await prisma.animal.findFirst({
    where: { id, tenantId: auth.tenantId, deletedAt: null },
    include: { tambo: { select: { id: true, name: true } } },
  });
  if (!root) throw new HttpError(404, "Animal not found");
  await requireTamboInTenant(auth, root.tamboId);

  const animalsById = new Map<string, PedigreeAnimal>();
  const siresById = new Map<string, PedigreeSire>();
  animalsById.set(root.id, toPedigreeAnimal(root));

  let frontier: string[] = [root.id];
  for (let level = 0; level < generations; level += 1) {
    const current = frontier
      .map((fid) => animalsById.get(fid))
      .filter((a): a is PedigreeAnimal => a != null && a.deletedAt == null);
    const nextAnimalIds = new Set<string>();
    const sireIds = new Set<string>();
    for (const a of current) {
      if (a.motherId && !animalsById.has(a.motherId)) nextAnimalIds.add(a.motherId);
      if (a.sireId && !siresById.has(a.sireId)) sireIds.add(a.sireId);
    }

    if (sireIds.size > 0) {
      const sires = await prisma.sire.findMany({
        where: { tenantId: auth.tenantId, id: { in: [...sireIds] } },
      });
      for (const s of sires) {
        siresById.set(s.id, {
          id: s.id,
          name: s.name,
          registrationCode: s.registrationCode,
          isExternal: s.isExternal,
          linkedAnimalId: s.linkedAnimalId,
        });
        if (s.linkedAnimalId && !animalsById.has(s.linkedAnimalId)) {
          nextAnimalIds.add(s.linkedAnimalId);
        }
      }
    }

    if (nextAnimalIds.size === 0) {
      frontier = [];
      continue;
    }

    const rows = await prisma.animal.findMany({
      where: { tenantId: auth.tenantId, id: { in: [...nextAnimalIds] } },
      include: { tambo: { select: { id: true, name: true } } },
    });
    frontier = [];
    for (const row of rows) {
      animalsById.set(row.id, toPedigreeAnimal(row));
      if (!row.deletedAt) frontier.push(row.id);
    }
  }

  const tree = buildPedigree({
    rootId: root.id,
    animalsById,
    siresById,
    generations,
  });

  const linkedSires = await prisma.sire.findMany({
    where: { tenantId: auth.tenantId, linkedAnimalId: id },
  });
  const offspringAnimals = await prisma.animal.findMany({
    where: {
      tenantId: auth.tenantId,
      deletedAt: null,
      OR: [
        { motherId: id },
        ...(linkedSires.length > 0 ? [{ sireId: { in: linkedSires.map((s) => s.id) } }] : []),
      ],
    },
    include: { tambo: { select: { id: true, name: true } } },
  });

  const offspring = listOffspring({
    parentAnimalId: id,
    animals: offspringAnimals.map(toPedigreeAnimal),
    sires: linkedSires.map((s) => ({
      id: s.id,
      name: s.name,
      registrationCode: s.registrationCode,
      isExternal: s.isExternal,
      linkedAnimalId: s.linkedAnimalId,
    })),
  }).slice(0, 100);

  res.json({
    animal: { id: root.id, earTag: root.earTag },
    mother: tree.mother,
    father: tree.father,
    offspring,
  });
});
