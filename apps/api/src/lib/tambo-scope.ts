import { prisma } from "./prisma.js";
import { assertTamboAccess } from "./access.js";
import { HttpError } from "./http-error.js";
import type { AuthContext } from "../types/express.js";

/** Verifica que el tambo exista en el tenant del JWT y que el user tenga acceso. */
export async function requireTamboInTenant(
  auth: AuthContext,
  tamboId: string,
) {
  assertTamboAccess(auth.tamboIds, tamboId);

  const tambo = await prisma.tambo.findFirst({
    where: { id: tamboId, tenantId: auth.tenantId, active: true },
  });

  if (!tambo) {
    throw new HttpError(404, "Tambo not found in this tenant");
  }

  return tambo;
}
