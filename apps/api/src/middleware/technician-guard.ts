import type { NextFunction, Request, Response } from "express";
import type { Role } from "@prisma/client";

/**
 * Roles de gente del tambo / tenant. Si el JWT solo tiene TECNICO (externo),
 * se aplica lista blanca de rutas. Si además tiene rol de tambo, no se restringe aquí
 * (los endpoints siguen usando requireRoles).
 */
const FARM_ROLES: Role[] = ["TAMBERO", "DUENIO", "ADMIN", "VETERINARIO"];

/**
 * Prefijos permitidos para sesión solo-TECNICO.
 * Al agregar endpoints nuevos: o entran acá a propósito, o quedan bloqueados.
 */
export const TECNICO_ALLOWED_PATH_PREFIXES = [
  "/health",
  "/auth",
  "/tambos",
  "/part-types",
  "/part-instances",
  "/service-requests",
  "/memberships/accept-invite",
  "/notifications",
] as const;

export function isTechnicianOnly(roles: Role[]): boolean {
  const hasTecnico = roles.includes("TECNICO");
  if (!hasTecnico) return false;
  return !roles.some((r) => FARM_ROLES.includes(r));
}

function pathAllowedForTechnician(path: string): boolean {
  const p = path.split("?")[0] ?? path;
  return TECNICO_ALLOWED_PATH_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`),
  );
}

/**
 * Guard global: TECNICO puro no puede tocar animales/producción/etc.
 * Montar después de authenticate en rutas protegidas, o como middleware
 * que solo actúa si req.auth ya existe.
 */
export function technicianResourceGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.auth) {
    next();
    return;
  }

  if (!isTechnicianOnly(req.auth.roles)) {
    next();
    return;
  }

  if (pathAllowedForTechnician(req.path) || pathAllowedForTechnician(req.originalUrl)) {
    next();
    return;
  }

  // Express monta routers con req.path relativo al mount; originalUrl tiene el full.
  const full = req.originalUrl.split("?")[0] ?? req.originalUrl;
  if (pathAllowedForTechnician(full)) {
    next();
    return;
  }

  res.status(403).json({
    error: "Technician role cannot access this resource",
    allowed: TECNICO_ALLOWED_PATH_PREFIXES,
  });
}
