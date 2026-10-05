import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { notifyOwners } from "../lib/notifications.js";
import { parseInstalledAt } from "../lib/part-date.js";
import { assertTenantPhotoUrls } from "../lib/photo-url.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import {
  authorRoleFromSession,
  isFarmManager,
  isTecnicoOnly,
  replacePartsInReport,
  reportInclude,
  serializeWorkReport,
  technicianProviderWhere,
  assertServiceRequestForReport,
} from "../lib/work-report-ops.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

export const workReportsRouter = Router();

const measurementSchema = z.object({
  label: z.string().trim().min(1).max(80),
  value: z.union([z.string().trim().min(1).max(80), z.number()]),
  unit: z.string().trim().max(40).optional(),
});

const createSchema = z.object({
  tamboId: z.string().uuid(),
  serviceRequestId: z.string().uuid().optional().nullable(),
  performedAt: z.string().min(1).optional(),
});

const patchSchema = z.object({
  performedAt: z.string().min(1).optional(),
  summary: z.string().max(2000).optional(),
  tasks: z.array(z.string().trim().max(200)).max(30).optional(),
  hoursWorked: z.number().min(0).max(100).nullable().optional(),
  measurements: z.array(measurementSchema).max(20).optional(),
  photoUrls: z.array(z.string().trim().min(1).max(2000)).max(6).optional(),
});

const replaceSchema = z.object({
  instanceIds: z.array(z.string().uuid()).min(1).max(50),
  installedAt: z.string().min(1),
  installedAtApprox: z.boolean().optional(),
  notes: z.string().max(2000).optional().nullable(),
});

const listSchema = z.object({
  tamboId: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
  serviceRequestId: z.string().uuid().optional(),
});

function normalizeMeasurements(
  items: z.infer<typeof measurementSchema>[],
): Prisma.InputJsonValue {
  return items.map((m) => ({
    label: m.label,
    value: typeof m.value === "number" ? String(m.value) : m.value,
    ...(m.unit ? { unit: m.unit } : {}),
  }));
}

async function listVisibilityWhere(
  auth: Parameters<typeof isTecnicoOnly>[0],
  tamboId: string,
) {
  if (isFarmManager(auth.roles)) return {};

  if (isTecnicoOnly(auth)) {
    const visible = await prisma.serviceRequest.findMany({
      where: {
        tenantId: auth.tenantId,
        tamboId,
        ...technicianProviderWhere(auth),
      },
      select: { id: true },
    });
    const ids = visible.map((r) => r.id);
    return {
      OR: [
        { authorId: auth.userId },
        {
          AND: [
            { serviceRequestId: { in: ids.length ? ids : ["00000000-0000-0000-0000-000000000000"] } },
            { status: "SUBMITTED" as const },
          ],
        },
      ],
    };
  }

  return {
    OR: [{ authorId: auth.userId }, { status: "SUBMITTED" as const }],
  };
}

async function loadVisibleReport(auth: Parameters<typeof isTecnicoOnly>[0], id: string) {
  const report = await prisma.workReport.findFirst({
    where: { id, tenantId: auth.tenantId },
    include: reportInclude,
  });
  if (!report) throw new HttpError(404, "Informe de trabajo no encontrado.");
  await requireTamboInTenant(auth, report.tamboId);

  if (isFarmManager(auth.roles)) return report;
  if (report.authorId === auth.userId) return report;
  if (report.status === "DRAFT") {
    throw new HttpError(404, "Informe de trabajo no encontrado.");
  }
  if (isTecnicoOnly(auth)) {
    if (!report.serviceRequestId) {
      throw new HttpError(404, "Informe de trabajo no encontrado.");
    }
    const sr = await prisma.serviceRequest.findFirst({
      where: {
        id: report.serviceRequestId,
        tenantId: auth.tenantId,
        ...technicianProviderWhere(auth),
      },
      select: { id: true },
    });
    if (!sr) throw new HttpError(404, "Informe de trabajo no encontrado.");
  }
  return report;
}

function assertDraftAuthor(
  report: { status: string; authorId: string },
  userId: string,
  action: string,
) {
  if (report.status !== "DRAFT") {
    throw new HttpError(409, `El informe ya fue enviado: no se puede ${action}.`);
  }
  if (report.authorId !== userId) {
    throw new HttpError(403, "Solo el autor puede editar este borrador.");
  }
}

workReportsRouter.get(
  "/",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "TECNICO"),
  async (req, res) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    const auth = req.auth!;
    const { tamboId, from, to, serviceRequestId } = parsed.data;
    await requireTamboInTenant(auth, tamboId);
    const visibility = await listVisibilityWhere(auth, tamboId);

    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;
    if (fromDate && Number.isNaN(fromDate.getTime())) {
      throw new HttpError(400, "La fecha desde no es válida.");
    }
    if (toDate && Number.isNaN(toDate.getTime())) {
      throw new HttpError(400, "La fecha hasta no es válida.");
    }

    const items = await prisma.workReport.findMany({
      where: {
        tenantId: auth.tenantId,
        tamboId,
        ...visibility,
        ...(serviceRequestId ? { serviceRequestId } : {}),
        ...(fromDate || toDate
          ? {
              performedAt: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
      include: {
        ...reportInclude,
        _count: { select: { installedParts: true } },
      },
      orderBy: { performedAt: "desc" },
      take: 200,
    });

    res.json({ items: items.map(serializeWorkReport) });
  },
);

workReportsRouter.post(
  "/",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "TECNICO"),
  async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    const auth = req.auth!;
    const authorRole = authorRoleFromSession(auth.roles);
    const { tamboId } = parsed.data;
    await requireTamboInTenant(auth, tamboId);

    let serviceRequestId = parsed.data.serviceRequestId ?? null;
    if (authorRole === "TECNICO") {
      if (!serviceRequestId) {
        throw new HttpError(
          400,
          "El técnico necesita un pedido de service en curso para armar el informe.",
        );
      }
    }
    if (serviceRequestId) {
      await assertServiceRequestForReport(auth, tamboId, serviceRequestId);
      const existing = await prisma.workReport.findFirst({
        where: {
          tenantId: auth.tenantId,
          authorId: auth.userId,
          serviceRequestId,
          status: "DRAFT",
        },
        include: reportInclude,
      });
      if (existing) {
        res.status(200).json({ item: serializeWorkReport(existing) });
        return;
      }
    }

    const performedAt = parsed.data.performedAt
      ? parseInstalledAt(parsed.data.performedAt)
      : new Date();

    const item = await prisma.workReport.create({
      data: {
        tenantId: auth.tenantId,
        tamboId,
        serviceRequestId,
        authorId: auth.userId,
        authorRole,
        performedAt,
      },
      include: reportInclude,
    });
    res.status(201).json({ item: serializeWorkReport(item) });
  },
);

workReportsRouter.get(
  "/:id",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "TECNICO"),
  async (req, res) => {
    const report = await loadVisibleReport(req.auth!, String(req.params.id));
    res.json({ item: serializeWorkReport(report) });
  },
);

workReportsRouter.patch(
  "/:id",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "TECNICO"),
  async (req, res) => {
    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    const auth = req.auth!;
    const existing = await prisma.workReport.findFirst({
      where: { id: String(req.params.id), tenantId: auth.tenantId },
    });
    if (!existing) throw new HttpError(404, "Informe de trabajo no encontrado.");
    await requireTamboInTenant(auth, existing.tamboId);
    assertDraftAuthor(existing, auth.userId, "editar");

    const data = parsed.data;
    if (data.photoUrls != null) {
      assertTenantPhotoUrls(data.photoUrls, auth.tenantId);
    }
    const item = await prisma.workReport.update({
      where: { id: existing.id },
      data: {
        ...(data.performedAt != null
          ? { performedAt: parseInstalledAt(data.performedAt) }
          : {}),
        ...(data.summary != null ? { summary: data.summary } : {}),
        ...(data.tasks != null
          ? { tasks: data.tasks.filter((t) => t.length > 0) as Prisma.InputJsonValue }
          : {}),
        ...(data.hoursWorked !== undefined
          ? {
              hoursWorked:
                data.hoursWorked == null ? null : new Prisma.Decimal(data.hoursWorked),
            }
          : {}),
        ...(data.measurements != null
          ? { measurements: normalizeMeasurements(data.measurements) }
          : {}),
        ...(data.photoUrls != null ? { photoUrls: data.photoUrls } : {}),
      },
      include: reportInclude,
    });
    res.json({ item: serializeWorkReport(item) });
  },
);

workReportsRouter.post(
  "/:id/replace-parts",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "TECNICO"),
  async (req, res) => {
    const parsed = replaceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }
    const auth = req.auth!;
    const existing = await prisma.workReport.findFirst({
      where: { id: String(req.params.id), tenantId: auth.tenantId },
    });
    if (!existing) throw new HttpError(404, "Informe de trabajo no encontrado.");
    await requireTamboInTenant(auth, existing.tamboId);
    assertDraftAuthor(existing, auth.userId, "agregar piezas");

    const items = await replacePartsInReport({
      auth,
      reportId: existing.id,
      tamboId: existing.tamboId,
      instanceIds: parsed.data.instanceIds,
      installedAt: parsed.data.installedAt,
      installedAtApprox: parsed.data.installedAtApprox,
      notes: parsed.data.notes,
    });
    const report = await prisma.workReport.findFirstOrThrow({
      where: { id: existing.id },
      include: reportInclude,
    });
    res.status(201).json({
      item: serializeWorkReport(report),
      parts: items,
    });
  },
);

workReportsRouter.post(
  "/:id/submit",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "TECNICO"),
  async (req, res) => {
    const auth = req.auth!;
    const existing = await prisma.workReport.findFirst({
      where: { id: String(req.params.id), tenantId: auth.tenantId },
      include: {
        tambo: { select: { name: true } },
        author: { select: { name: true } },
        installedParts: { select: { id: true } },
      },
    });
    if (!existing) throw new HttpError(404, "Informe de trabajo no encontrado.");
    await requireTamboInTenant(auth, existing.tamboId);
    assertDraftAuthor(existing, auth.userId, "enviar");

    const tasks = Array.isArray(existing.tasks)
      ? existing.tasks.filter((t) => typeof t === "string" && t.trim().length > 0)
      : [];
    const hasSummary = existing.summary.trim().length > 0;
    if (!hasSummary && tasks.length === 0 && existing.installedParts.length === 0) {
      throw new HttpError(400, "El informe está vacío");
    }

    const item = await prisma.workReport.update({
      where: { id: existing.id },
      data: { status: "SUBMITTED", submittedAt: new Date() },
      include: reportInclude,
    });

    if (existing.authorRole === "TECNICO") {
      const n = item.installedParts.length;
      const taskCount = Array.isArray(item.tasks)
        ? item.tasks.filter((t) => typeof t === "string" && t.trim()).length
        : 0;
      await notifyOwners(auth.tenantId, {
        tamboId: existing.tamboId,
        excludeUserId: auth.userId,
        type: "WORK_REPORT_SUBMITTED",
        title: "Informe de trabajo",
        body: `${existing.author.name} entregó un informe en ${existing.tambo.name}: ${n} piezas cambiadas, ${taskCount} tareas`,
        payload: { workReportId: item.id, serviceRequestId: item.serviceRequestId },
      });
    }

    res.json({ item: serializeWorkReport(item) });
  },
);

workReportsRouter.delete(
  "/:id",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "TECNICO"),
  async (req, res) => {
    const auth = req.auth!;
    const existing = await prisma.workReport.findFirst({
      where: { id: String(req.params.id), tenantId: auth.tenantId },
      include: { _count: { select: { installedParts: true } } },
    });
    if (!existing) throw new HttpError(404, "Informe de trabajo no encontrado.");
    await requireTamboInTenant(auth, existing.tamboId);
    assertDraftAuthor(existing, auth.userId, "borrar");
    if (existing._count.installedParts > 0) {
      throw new HttpError(
        409,
        "No se puede borrar: ya hay piezas cambiadas en este borrador. Esos cambios no se revierten.",
      );
    }
    await prisma.workReport.delete({ where: { id: existing.id } });
    res.json({
      ok: true,
      note: "Las piezas ya reemplazadas dentro de un borrador no se revierten.",
    });
  },
);
