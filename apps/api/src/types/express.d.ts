import type { Role } from "@prisma/client";

export type AuthContext = {
  userId: string;
  tenantId: string;
  roles: Role[];
  /** null = acceso a todos los tambos del tenant (dueño/admin) */
  tamboIds: string[] | null;
  /** Proveedor del técnico. Null si no aplica o es independiente. */
  serviceProviderId: string | null;
  mustChangePassword?: boolean;
};

export type DeviceAuthContext = {
  id: string;
  tenantId: string;
  tamboId: string;
  bajadaNumber: number | null;
  kind: "FLOW_METER" | "RFID_READER" | "VACUUM_PUMP_SENSOR" | "GATE_SENSOR";
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
      device?: DeviceAuthContext;
    }
  }
}

export {};
