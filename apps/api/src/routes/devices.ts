import { Router } from "express";
import { z } from "zod";
import { assertTamboAccess } from "../lib/access.js";
import {
  assertCanManageDevices,
  createInstalledDevice,
  findDeviceForManage,
  listActiveDevices,
  membershipCanManageDevices,
  retireDevice,
  rotateDeviceToken,
} from "../lib/devices.js";
import { requireTamboInTenant } from "../lib/tambo-scope.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";

export const devicesRouter = Router();

const tamboQuerySchema = z.object({
  tamboId: z.string().uuid(),
});

const createSchema = z.object({
  tamboId: z.string().uuid(),
  kind: z.enum(["VACUUM_PUMP_SENSOR", "FLOW_METER", "RFID_READER"]),
  bajadaNumber: z.number().int().min(1).optional().nullable(),
  label: z.string().trim().min(1).max(120).optional().nullable(),
});

devicesRouter.get(
  "/",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "VETERINARIO", "TECNICO"),
  async (req, res) => {
    const parsed = tamboQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    const tambo = await requireTamboInTenant(auth, parsed.data.tamboId, {
      includeInactive: true,
    });
    const listed = await listActiveDevices(tambo.id);

    res.json({
      items: listed.items,
      tambo: listed.tambo,
      canManage: await membershipCanManageDevices(auth),
    });
  },
);

devicesRouter.post(
  "/",
  authenticate,
  requireRoles("TECNICO"),
  async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const auth = req.auth!;
    await assertCanManageDevices(auth);
    const tambo = await requireTamboInTenant(auth, parsed.data.tamboId);
    const result = await createInstalledDevice({
      tambo,
      kind: parsed.data.kind,
      bajadaNumber: parsed.data.bajadaNumber,
      label: parsed.data.label,
      createdById: auth.userId,
    });

    res.status(201).json(result);
  },
);

devicesRouter.post(
  "/:id/rotate-token",
  authenticate,
  requireRoles("TECNICO"),
  async (req, res) => {
    const auth = req.auth!;
    await assertCanManageDevices(auth);
    const existing = await findDeviceForManage(String(req.params.id), auth.tenantId);
    assertTamboAccess(auth.tamboIds, existing.tamboId);
    const result = await rotateDeviceToken(existing.id, auth.tenantId);
    res.json(result);
  },
);

devicesRouter.post(
  "/:id/retire",
  authenticate,
  requireRoles("TECNICO"),
  async (req, res) => {
    const auth = req.auth!;
    await assertCanManageDevices(auth);
    const existing = await findDeviceForManage(String(req.params.id), auth.tenantId);
    assertTamboAccess(auth.tamboIds, existing.tamboId);
    const result = await retireDevice(existing.id, auth.tenantId);
    res.json(result);
  },
);
