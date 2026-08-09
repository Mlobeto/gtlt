import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { env } from "./env.js";
import type { AuthContext } from "../types/express.js";

export type JwtPayload = {
  sub: string;
  tenantId: string;
  roles: Role[];
  tamboIds: string[] | null;
};

export function signAccessToken(ctx: AuthContext): string {
  const payload: JwtPayload = {
    sub: ctx.userId,
    tenantId: ctx.tenantId,
    roles: ctx.roles,
    tamboIds: ctx.tamboIds,
  };

  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function verifyAccessToken(token: string): AuthContext {
  const decoded = jwt.verify(token, env.jwtSecret) as JwtPayload;
  if (!decoded.sub || !decoded.tenantId || !Array.isArray(decoded.roles)) {
    throw new Error("Invalid token payload");
  }

  return {
    userId: decoded.sub,
    tenantId: decoded.tenantId,
    roles: decoded.roles,
    tamboIds: decoded.tamboIds ?? null,
  };
}
