import type { NextFunction, Request, Response } from "express";

function pathOf(req: Request) {
  return (req.originalUrl ?? req.url ?? "").split("?")[0];
}

function isAllowed(req: Request) {
  const path = pathOf(req);
  if (req.method === "POST" && path === "/auth/change-password") return true;
  if (req.method === "GET" && path === "/auth/me") return true;
  if (req.method === "POST" && (path === "/auth/logout" || path === "/auth/sign-out")) {
    return true;
  }
  return false;
}

/** Bloquea rutas autenticadas si el token tiene mustChangePassword. */
export function requirePasswordChange(req: Request, res: Response, next: NextFunction): void {
  if (!req.auth?.mustChangePassword) {
    next();
    return;
  }
  if (isAllowed(req)) {
    next();
    return;
  }
  res.status(403).json({
    error: "Tenés que elegir una clave nueva antes de seguir.",
    code: "PASSWORD_CHANGE_REQUIRED",
  });
}
