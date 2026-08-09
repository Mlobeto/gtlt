import type { Role } from "@prisma/client";

export type AuthContext = {
  userId: string;
  tenantId: string;
  roles: Role[];
  /** null = acceso a todos los tambos del tenant (dueño/admin) */
  tamboIds: string[] | null;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
