import { randomBytes } from "node:crypto";
import type { Device, DeviceKind, Tambo } from "@prisma/client";
import { prisma } from "./prisma.js";
import { HttpError } from "./http-error.js";
import type { AuthContext } from "../types/express.js";

/** Un dispositivo se considera conectado si reportó en esta ventana. */
export const DEVICE_CONNECTED_WINDOW_MS = 5 * 60 * 1000;

const KIND_NEEDS_BAJADA: DeviceKind[] = ["FLOW_METER", "RFID_READER"];

export type PublicDevice = {
  id: string;
  tamboId: string;
  kind: DeviceKind;
  bajadaNumber: number | null;
  label: string | null;
  lastSeenAt: Date | null;
  connected: boolean;
  createdAt: Date;
};

export function isDeviceConnected(lastSeenAt: Date | null | undefined): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - lastSeenAt.getTime() <= DEVICE_CONNECTED_WINDOW_MS;
}

export function newDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

/** Permiso de instalador: se lee de la membership en cada llamada (revocar vale al toque). */
export async function membershipCanManageDevices(auth: AuthContext): Promise<boolean> {
  if (!auth.roles.includes("TECNICO")) return false;
  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: auth.tenantId, userId: auth.userId } },
    select: { canInstallDevices: true, status: true },
  });
  return Boolean(membership?.status === "ACTIVE" && membership.canInstallDevices);
}

export async function assertCanManageDevices(auth: AuthContext): Promise<void> {
  if (!(await membershipCanManageDevices(auth))) {
    throw new HttpError(
      403,
      "Solo un técnico autorizado como instalador puede instalar, retirar o rotar dispositivos.",
    );
  }
}

export function toPublicDevice(device: Device): PublicDevice {
  return {
    id: device.id,
    tamboId: device.tamboId,
    kind: device.kind,
    bajadaNumber: device.bajadaNumber,
    label: device.label,
    lastSeenAt: device.lastSeenAt,
    connected: isDeviceConnected(device.lastSeenAt),
    createdAt: device.createdAt,
  };
}

export function normalizeBajadaNumber(
  kind: DeviceKind,
  bajadaNumber: number | null | undefined,
): number | null {
  if (kind === "VACUUM_PUMP_SENSOR") {
    if (bajadaNumber != null) {
      throw new HttpError(400, "El sensor de bomba de vacío no usa número de bajada.");
    }
    return null;
  }
  if (!KIND_NEEDS_BAJADA.includes(kind)) {
    throw new HttpError(400, "Tipo de dispositivo no válido.");
  }
  if (bajadaNumber == null) {
    throw new HttpError(400, "bajadaNumber es obligatorio para caudalímetro y lector de caravanas.");
  }
  return bajadaNumber;
}

export async function assertDeviceInstallRules(
  tambo: Pick<Tambo, "id" | "bajadaCount">,
  kind: DeviceKind,
  bajadaNumber: number | null | undefined,
): Promise<number | null> {
  const bajada = normalizeBajadaNumber(kind, bajadaNumber);

  if (bajada != null && (bajada < 1 || bajada > tambo.bajadaCount)) {
    throw new HttpError(
      400,
      `bajadaNumber debe estar entre 1 y ${tambo.bajadaCount} (bajadas de este tambo).`,
    );
  }

  if (kind === "VACUUM_PUMP_SENSOR") {
    const existing = await prisma.device.findFirst({
      where: { tamboId: tambo.id, kind, retiredAt: null },
    });
    if (existing) {
      throw new HttpError(
        409,
        "Este tambo ya tiene un sensor de bomba de vacío. Retiralo antes de instalar otro.",
      );
    }
    return null;
  }

  const existing = await prisma.device.findFirst({
    where: { tamboId: tambo.id, kind, bajadaNumber: bajada, retiredAt: null },
  });
  if (existing) {
    throw new HttpError(
      409,
      `Ya hay un dispositivo ${kind} activo en la bajada ${bajada}. Retiralo antes de instalar otro.`,
    );
  }
  return bajada;
}

export async function createInstalledDevice(input: {
  tambo: Pick<Tambo, "id" | "tenantId" | "bajadaCount" | "active">;
  kind: DeviceKind;
  bajadaNumber?: number | null;
  label?: string | null;
  createdById: string;
}): Promise<{ item: PublicDevice; deviceToken: string }> {
  if (!input.tambo.active) {
    throw new HttpError(400, "No se puede instalar un dispositivo en un tambo archivado.");
  }

  const bajadaNumber = await assertDeviceInstallRules(
    input.tambo,
    input.kind,
    input.bajadaNumber,
  );
  const deviceToken = newDeviceToken();
  const device = await prisma.device.create({
    data: {
      tenantId: input.tambo.tenantId,
      tamboId: input.tambo.id,
      kind: input.kind,
      bajadaNumber,
      label: input.label?.trim() ? input.label.trim() : null,
      deviceToken,
      createdById: input.createdById,
    },
  });

  return { item: toPublicDevice(device), deviceToken };
}

export async function listActiveDevices(tamboId: string) {
  const [devices, tambo] = await Promise.all([
    prisma.device.findMany({
      where: { tamboId, retiredAt: null },
      orderBy: [{ kind: "asc" }, { bajadaNumber: "asc" }, { createdAt: "asc" }],
    }),
    prisma.tambo.findUnique({
      where: { id: tamboId },
      select: { id: true, bajadaCount: true },
    }),
  ]);

  return {
    items: devices.map(toPublicDevice),
    tambo,
  };
}

export async function findDeviceForManage(id: string, tenantId?: string) {
  const device = await prisma.device.findFirst({
    where: { id, ...(tenantId ? { tenantId } : {}) },
  });
  if (!device) {
    throw new HttpError(404, "Dispositivo no encontrado");
  }
  if (device.retiredAt) {
    throw new HttpError(409, "Este dispositivo ya fue retirado.");
  }
  return device;
}

export async function rotateDeviceToken(deviceId: string, tenantId?: string) {
  const device = await findDeviceForManage(deviceId, tenantId);
  const deviceToken = newDeviceToken();
  const updated = await prisma.device.update({
    where: { id: device.id },
    data: { deviceToken },
  });
  return { item: toPublicDevice(updated), deviceToken };
}

export async function retireDevice(deviceId: string, tenantId?: string) {
  const device = await findDeviceForManage(deviceId, tenantId);
  const updated = await prisma.device.update({
    where: { id: device.id },
    data: { retiredAt: new Date() },
  });
  return { item: toPublicDevice(updated) };
}
