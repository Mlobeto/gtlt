import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { HttpError } from "../lib/http-error.js";
import { hasAllTamboAccess } from "../lib/access.js";
import { normalizeWhatsAppPhone } from "../lib/phone.js";
import {
  listVisibleProviders,
  serializeVisibleProvider,
} from "../lib/service-providers.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

export const serviceProvidersRouter = Router();

const nameSchema = z.string().trim().min(2).max(80);
const contactNameSchema = z.string().trim().max(80).optional().nullable();
const contactPhoneSchema = z.string().trim().max(30).optional().nullable();

async function assertUniquePrivateName(
  tenantId: string,
  name: string,
  excludeId?: string,
) {
  const clash = await prisma.serviceProvider.findFirst({
    where: {
      tenantId,
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (clash) {
    throw new HttpError(409, "Ya tenés una empresa con ese nombre.");
  }
}

serviceProvidersRouter.get(
  "/",
  authenticate,
  requireRoles("DUENIO", "ADMIN", "TAMBERO"),
  async (req, res) => {
    const query = z
      .object({ tamboId: z.string().uuid().optional() })
      .safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Invalid query", details: query.error.flatten() });
      return;
    }

    const auth = req.auth!;
    let defaultId: string | null = null;
    if (query.data.tamboId) {
      await requireTamboInTenant(auth, query.data.tamboId);
      const tambo = await prisma.tambo.findFirst({
        where: { id: query.data.tamboId, tenantId: auth.tenantId },
        select: { defaultServiceProviderId: true },
      });
      defaultId = tambo?.defaultServiceProviderId ?? null;
    }

    const ownerAdmin = hasAllTamboAccess(auth.roles);
    const items = ownerAdmin
      ? await prisma.serviceProvider.findMany({
          where: {
            OR: [{ tenantId: null, active: true }, { tenantId: auth.tenantId }],
          },
          orderBy: [{ tenantId: "asc" }, { isDefault: "desc" }, { name: "asc" }],
        })
      : await listVisibleProviders(prisma, auth.tenantId);

    res.json({
      items: items.map((p) => serializeVisibleProvider(p, defaultId)),
    });
  },
);

serviceProvidersRouter.post(
  "/",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const parsed = z
      .object({
        name: nameSchema,
        contactName: contactNameSchema,
        contactPhone: contactPhoneSchema,
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const name = parsed.data.name;
    await assertUniquePrivateName(auth.tenantId, name);

    const contactName = parsed.data.contactName?.trim() || null;
    const contactPhone = normalizeWhatsAppPhone(parsed.data.contactPhone ?? null);

    const item = await prisma.serviceProvider.create({
      data: {
        name,
        tenantId: auth.tenantId,
        contactName,
        contactPhone,
        createdById: auth.userId,
        hasPanel: false,
      },
    });

    res.status(201).json({ item: serializeVisibleProvider(item) });
  },
);

serviceProvidersRouter.patch(
  "/:id",
  authenticate,
  requireRoles("DUENIO", "ADMIN"),
  async (req, res) => {
    const parsed = z
      .object({
        name: nameSchema.optional(),
        contactName: contactNameSchema,
        contactPhone: contactPhoneSchema,
        active: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const existing = await prisma.serviceProvider.findFirst({
      where: { id: String(req.params.id), tenantId: auth.tenantId },
    });
    if (!existing) throw new HttpError(404, "Empresa no encontrada");

    if (parsed.data.active === false) {
      const tambos = await prisma.tambo.findMany({
        where: { defaultServiceProviderId: existing.id },
        select: { id: true, name: true },
      });
      if (tambos.length > 0) {
        throw new HttpError(
          409,
          "No se puede desactivar: es el proveedor predeterminado de uno o más tambos.",
          undefined,
          { tambos },
        );
      }
    }

    if (parsed.data.name && parsed.data.name !== existing.name) {
      await assertUniquePrivateName(auth.tenantId, parsed.data.name, existing.id);
    }

    const item = await prisma.serviceProvider.update({
      where: { id: existing.id },
      data: {
        ...(parsed.data.name != null ? { name: parsed.data.name } : {}),
        ...(parsed.data.contactName !== undefined
          ? { contactName: parsed.data.contactName?.trim() || null }
          : {}),
        ...(parsed.data.contactPhone !== undefined
          ? { contactPhone: normalizeWhatsAppPhone(parsed.data.contactPhone) }
          : {}),
        ...(parsed.data.active != null ? { active: parsed.data.active } : {}),
      },
    });

    res.json({ item: serializeVisibleProvider(item) });
  },
);
