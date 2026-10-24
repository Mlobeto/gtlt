import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/auth-tokens.js";
import { accessCheckEnabled, assertSessionValid } from "../lib/access-session.js";
import { HttpError } from "../lib/http-error.js";

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  try {
    req.auth = verifyAccessToken(header.slice("Bearer ".length));
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  if (!accessCheckEnabled()) {
    next();
    return;
  }

  try {
    await assertSessionValid(req.auth);
    next();
  } catch (err) {
    if (err instanceof HttpError) {
      next(err);
      return;
    }
    next(new HttpError(503, "No se pudo comprobar el acceso. Probá de nuevo."));
  }
}
