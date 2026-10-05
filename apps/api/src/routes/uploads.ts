import { Router } from "express";
import multer from "multer";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import { HttpError } from "../lib/http-error.js";
import { downloadImage, uploadImage } from "../lib/blob-storage.js";
import { tenantPhotoBlobName } from "../lib/photo-url.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";
import { verifyAccessToken } from "../lib/auth-tokens.js";

export const uploadsRouter = Router();

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TO_EXT[file.mimetype]) {
      cb(new HttpError(400, "Solo se aceptan imágenes JPEG, PNG o WEBP"));
      return;
    }
    cb(null, true);
  },
});

/**
 * Sube una foto (perfil de animal o consulta) a Azure Blob Storage y devuelve su URL.
 * El cliente usa esa URL después en POST/PATCH /animals o POST /animals/:id/photos.
 */
uploadsRouter.post(
  "/photo",
  authenticate,
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "VETERINARIO", "TECNICO"),
  (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        next(new HttpError(413, "La foto es demasiado grande (máximo 20 MB)"));
        return;
      }
      next(err);
    });
  },
  async (req, res) => {
    if (!req.file) {
      throw new HttpError(400, "Falta el archivo (campo 'file')");
    }

    const auth = req.auth!;
    const extension = ALLOWED_MIME_TO_EXT[req.file.mimetype];
    const url = await uploadImage(auth.tenantId, req.file.buffer, req.file.mimetype, extension);
    res.status(201).json({ url });
  },
);

/** Lee una foto del contenedor. Bearer o `access_token` (para <img> en el web). */
uploadsRouter.get("/file", async (req, res) => {
  const header = req.headers.authorization;
  const queryToken = typeof req.query.access_token === "string" ? req.query.access_token : "";
  const raw = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : queryToken;
  if (!raw) {
    throw new HttpError(401, "Missing or invalid Authorization header");
  }
  let auth;
  try {
    auth = verifyAccessToken(raw);
  } catch {
    throw new HttpError(401, "Invalid or expired token");
  }

  const url = typeof req.query.url === "string" ? req.query.url : "";
  const blobName = tenantPhotoBlobName(url, auth.tenantId);
  const download = await downloadImage(blobName);
  const body = download.readableStreamBody;
  if (!body) {
    throw new HttpError(502, "No se pudo leer la foto del almacenamiento");
  }

  res.setHeader("Content-Type", download.contentType ?? "image/jpeg");
  res.setHeader("Cache-Control", "private, max-age=3600");
  if (download.contentLength != null) {
    res.setHeader("Content-Length", String(download.contentLength));
  }
  try {
    await pipeline(body as Readable, res);
  } catch (err) {
    if (!res.headersSent) throw err;
    res.destroy();
  }
});
