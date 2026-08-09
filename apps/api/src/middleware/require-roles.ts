import type { Role } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";

/** El usuario debe tener al menos uno de los roles indicados. */
export function requireRoles(...allowed: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }

    const ok = req.auth.roles.some((role) => allowed.includes(role));
    if (!ok) {
      res.status(403).json({ error: "Insufficient role" });
      return;
    }

    next();
  };
}
