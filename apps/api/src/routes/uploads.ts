import { Router } from "express";
import multer from "multer";
import { HttpError } from "../lib/http-error.js";
import { authenticate } from "../middleware/authenticate.js";
import { requireRoles } from "../middleware/require-roles.js";
import { uploadImage } from "../lib/blob-storage.js";

export const uploadsRouter = Router();

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
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
  requireRoles("TAMBERO", "DUENIO", "ADMIN", "VETERINARIO"),
  upload.single("file"),
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
