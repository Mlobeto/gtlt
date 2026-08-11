import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/auth-tokens.js";

/** Si hay Bearer válido, setea req.auth (no falla si falta). Para el guard TECNICO. */
export function softAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    next();
    return;
  }
  try {
    req.auth = verifyAccessToken(header.slice("Bearer ".length));
  } catch {
    // leave unset; route-level authenticate will 401
  }
  next();
}
